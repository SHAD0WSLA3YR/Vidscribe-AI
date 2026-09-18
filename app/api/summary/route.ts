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

interface SummaryRequestBody {
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

  console.log('✓ API Key found, length:', process.env.OPENROUTER_API_KEY.length);

  const body = (await request.json()) as SummaryRequestBody;
  const { transcript, duration } = body;

  if (!transcript || transcript.length === 0) {
    return NextResponse.json({ error: 'Transcript required' }, { status: 400 });
  }

  // Take a substantial portion of the transcript for better summary quality
  const trimmedTranscript = transcript
    .slice(0, 2000)
    .map((entry) => `${entry.start.toFixed(1)}s: ${entry.text}`)
    .join('\n');

  try {
    console.log('📝 Creating OpenRouter client...');
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
            temperature: 0.5,
            max_tokens: 500,
            stream: false,
            messages: [
              {
                role: 'system',
                content:
                  'You are an expert at summarizing content. Create a clear, comprehensive summary (150-250 words) that captures the full narrative arc, key themes, main concepts, and learning objectives. The summary should give a reader who has not seen the content a complete understanding of what was covered. Focus on the most important information and insights.',
              },
              {
                role: 'user',
                content: `Create a summary of this lecture transcript:\n\n${trimmedTranscript}${
                  duration
                    ? `\n\nTotal duration: ${Math.floor(duration / 60)} minutes`
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

    const summary = completion.choices[0]?.message?.content?.trim() ?? '';
    console.log('📄 Response content length:', summary.length);
    console.log('📄 Response content type:', typeof summary);
    console.log('📄 Response content preview:', summary.substring(0, 200));

    if (!summary) {
      console.error('❌ Empty response from OpenRouter API');
      return NextResponse.json(
        { error: 'Failed to generate summary', details: 'Empty response from OpenRouter API' },
        { status: 500 }
      );
    }

    console.log('✓ Summary generated successfully');
    return NextResponse.json({ summary });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Summary generation failed:', errorMessage);
    console.error('Full error:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary', details: errorMessage },
      { status: 500 }
    );
  }
}
