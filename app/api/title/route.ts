import { NextResponse } from 'next/server';
import OpenAI from 'openai';

function createOpenRouterClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://localhost',
      'X-Title': process.env.OPENROUTER_APP_NAME ?? 'Lecture Transcript Studio',
    },
  });
}

interface TitleRequestBody {
  transcript: Array<{
    start: number;
    text: string;
  }>;
  duration?: number;
}

export async function POST(request: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ OPENROUTER_API_KEY not configured');
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY not configured' },
      { status: 500 }
    );
  }

  console.log('✓ API Key found for title generation');

  const body = (await request.json()) as TitleRequestBody;
  const { transcript, duration } = body;

  if (!transcript || transcript.length === 0) {
    return NextResponse.json({ error: 'Transcript required' }, { status: 400 });
  }

  // Take a sample from beginning, middle, and end for better title
  const startSegments = transcript.slice(0, 150);
  const midPoint = Math.floor(transcript.length / 2);
  const middleSegments = transcript.slice(midPoint, midPoint + 150);
  const endSegments = transcript.slice(-150);

  const sampledTranscript = [...startSegments, ...middleSegments, ...endSegments]
    .map((entry) => entry.text)
    .join(' ');

  try {
    console.log('📝 Generating title with OpenRouter...');
    const client = createOpenRouterClient(process.env.OPENROUTER_API_KEY);
    
    // Models to try in order (fallback if rate limited)
    const models = [
      'nvidia/nemotron-3.5-lightning:free',
      'dots-studio/dots-3-note-preview:free',
      'google/gemma-4-31b-it:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
    ];
    
    let completion = null;
    let lastError = null;
    
    // Try each model with exponential backoff
    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const model = models[modelIndex];
      
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          console.log(`📡 Attempt ${attempt + 1}/3 with model: ${model}`);
          
          completion = await client.chat.completions.create({
            model,
            temperature: 0.7,
            max_tokens: 100,
            stream: false,
            reasoning: { effort: 'none' },
            messages: [
              {
                role: 'system',
                content:
                  'You are an expert at creating concise, descriptive titles. Generate a clear, engaging title (5-10 words) that captures the main topic and purpose of the content. The title should be professional and informative. Return ONLY the title text, without quotes, prefixes, or explanations.',
              },
              {
                role: 'user',
                content: `Generate a title for this lecture transcript:\n\n${sampledTranscript}${
                  duration
                    ? `\n\nDuration: ${Math.floor(duration / 60)} minutes`
                    : ''
                }`,
              },
            ],
          });
          
          console.log(`✓ Success with ${model}`);
          break; // Success, exit retry loop
        } catch (error: any) {
          lastError = error;
          const isRateLimit = error?.status === 429 || error?.code === 429;
          
          if (isRateLimit && attempt < 2) {
            const delay = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
            console.log(`⏳ Rate limited, waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          // If rate limited, try next model after a delay
          if (isRateLimit && modelIndex < models.length - 1) {
            console.log(`⚠️ ${model} rate limited, trying next model...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before next model
            break;
          }
          
          // If not rate limit or last attempt/model, throw
          if (!isRateLimit || (attempt === 2 && modelIndex === models.length - 1)) {
            throw error;
          }
        }
      }
      
      if (completion) break; // Got a successful response
    }
    
    if (!completion) {
      throw lastError || new Error('All models failed');
    }

    console.log('📄 Full response object:', JSON.stringify(completion, null, 2));
    
    // Check if response exists and has the expected structure
    if (!completion || !completion.choices || completion.choices.length === 0) {
      console.error('❌ Invalid response structure from OpenRouter API');
      return NextResponse.json(
        { error: 'Invalid response from OpenRouter API', details: 'No choices in response' },
        { status: 500 }
      );
    }

    const title = completion.choices[0]?.message?.content?.trim() ?? '';
    console.log('📄 Generated title:', title);

    if (!title) {
      console.error('❌ Empty response from OpenRouter API');
      return NextResponse.json(
        { error: 'Failed to generate title', details: 'Empty response from OpenRouter API' },
        { status: 500 }
      );
    }

    // Clean up the title (remove quotes if AI added them)
    const cleanedTitle = title.replace(/^["']|["']$/g, '').trim();

    console.log('✓ Title generated successfully');
    return NextResponse.json({ title: cleanedTitle });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Title generation failed:', errorMessage);
    console.error('Full error:', error);
    return NextResponse.json(
      { error: 'Failed to generate title', details: errorMessage },
      { status: 500 }
    );
  }
}
