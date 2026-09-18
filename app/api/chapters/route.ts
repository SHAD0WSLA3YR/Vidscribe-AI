import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { nanoid } from 'nanoid';

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

interface ChaptersRequestBody {
  transcript: Array<{
    start: number;
    text: string;
  }>;
  duration?: number;
  maxChapters?: number;
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

  const body = (await request.json()) as ChaptersRequestBody;
  const { transcript, duration, maxChapters = 8 } = body;

  if (!transcript || transcript.length === 0) {
    return NextResponse.json({ error: 'Transcript required' }, { status: 400 });
  }

  const trimmedTranscript = transcript
    .slice(0, 1400)
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
            temperature: 0.4,
            max_tokens: 1000,
            stream: false,
            response_format: { type: 'json_object' },
            reasoning: { effort: 'none' },
            messages: [
              {
                role: 'system',
                content:
                  "You are an expert lecture note taker. Given a chronological transcript, group the content into concise, descriptive chapter titles (max 6 words) with accurate start times in seconds. Titles should be engaging and reflect the main idea, not verbatim transcript phrases. Return ONLY valid JSON (no markdown, no extra text) with a 'chapters' array. Each chapter must include 'title' and 'start'. Start times must be ascending. Example: {\"chapters\": [{\"title\": \"Introduction\", \"start\": 0}]}",
              },
              {
                role: 'user',
                content: `Extract chapters from this transcript:\n\n${trimmedTranscript}\n\nDuration: ${duration ?? 'unknown'} seconds\nMax chapters: ${maxChapters}\n\nReturn ONLY the JSON, nothing else.`,
              },
            ],
          });
          
          console.log(`✓ Success with ${model}`);
          break; // Success, exit retry loop
        } catch (error: any) {
          lastError = error;
          const isRateLimit = error?.status === 429 || error?.code === 429;
          
          if (isRateLimit && attempt < 2) {
            const delay = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s (increased from 1s, 2s, 4s)
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

    const content = completion.choices[0]?.message?.content ?? '{"chapters":[]}';
    console.log('📄 Response content length:', content.length);
    console.log('📄 Response content type:', typeof content);
    console.log('📄 Response content preview:', content.substring(0, 200));
    
    if (!content || content.trim() === '') {
      console.error('❌ Empty response from OpenRouter API');
      return NextResponse.json(
        { error: 'Empty response from OpenRouter API', details: 'No content received' },
        { status: 500 }
      );
    }
    
    // Extract JSON from the response (in case there's extra text)
    let jsonStr = content.trim();
    
    // Try to find JSON object in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    console.log('🔍 Extracted JSON:', jsonStr.substring(0, 150));
    
    const parsed = JSON.parse(jsonStr) as {
      chapters?: Array<{ title: string; start: number }>;
    };
    const chapters = (parsed.chapters ?? []).map((chapter) => ({
      id: `chapter-${nanoid()}`,
      title: chapter.title,
      start: Math.max(0, chapter.start),
      end: undefined as number | undefined,
    }));

    return NextResponse.json({
      chapters,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Chapter generation failed:', errorMessage);
    console.error('Full error:', error);
    return NextResponse.json(
      { error: 'Failed to generate chapters', details: errorMessage },
      { status: 500 }
    );
  }
}
