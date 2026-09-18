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

interface TranslateRequestBody {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
  context?: 'transcript' | 'title' | 'summary' | 'chapter';
}

export async function POST(request: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ OPENROUTER_API_KEY not configured');
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY not configured' },
      { status: 500 }
    );
  }

  const body = (await request.json()) as TranslateRequestBody;
  const { text, sourceLanguage, targetLanguage, context = 'transcript' } = body;

  if (!text || !targetLanguage) {
    return NextResponse.json(
      { error: 'Text and targetLanguage are required' },
      { status: 400 }
    );
  }

  try {
    const client = createOpenRouterClient(process.env.OPENROUTER_API_KEY);

    // Models to try in order (fallback if rate limited)
    const models = [
      'deepseek/deepseek-chat-v3.1:free',
      'moonshotai/kimi-k2:free',
      'google/gemma-3n-e4b-it:free',
      'nvidia/nemotron-nano-12b-v2-vl:free',
    ];

    let completion = null;
    let lastError = null;

    // Try each model with exponential backoff
    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const model = models[modelIndex];

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          console.log(
            `🌐 Translating ${context} to ${targetLanguage} (attempt ${attempt + 1}/3, model: ${model})`
          );

          const systemPrompt =
            context === 'title'
              ? `You are a professional translator. Translate the given title to ${targetLanguage}. Return ONLY the translated title, no explanations or extra text.`
              : context === 'summary'
              ? `You are a professional translator. Translate the given summary to ${targetLanguage}. Maintain the same tone and structure. Return ONLY the translated text, no explanations.`
              : context === 'chapter'
              ? `You are a professional translator. Translate the given chapter title to ${targetLanguage}. Keep it concise (max 6 words). Return ONLY the translated title, no explanations.`
              : `You are a professional translator. Translate the given transcript text to ${targetLanguage}. Maintain the natural flow and meaning. Return ONLY the translated text, no explanations.`;

          const userPrompt = sourceLanguage
            ? `Translate from ${sourceLanguage} to ${targetLanguage}:\n\n${text}`
            : `Translate to ${targetLanguage}:\n\n${text}`;

          completion = await client.chat.completions.create({
            model,
            temperature: 0.3,
            max_tokens: context === 'title' ? 50 : context === 'chapter' ? 30 : 1000,
            stream: false,
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: userPrompt,
              },
            ],
          });

          console.log(`✓ Translation success with ${model}`);
          break; // Success, exit retry loop
        } catch (error: any) {
          lastError = error;
          const isRateLimit = error?.status === 429 || error?.code === 429;

          if (isRateLimit && attempt < 2) {
            const delay = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
            console.log(`⏳ Rate limited, waiting ${delay}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          // If rate limited, try next model after a delay
          if (isRateLimit && modelIndex < models.length - 1) {
            console.log(`⚠️ ${model} rate limited, trying next model...`);
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s before next model
            break;
          }

          // If not rate limit or last attempt/model, throw
          if (
            !isRateLimit ||
            (attempt === 2 && modelIndex === models.length - 1)
          ) {
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
        {
          error: 'Invalid response from OpenRouter API',
          details: 'No choices in response',
        },
        { status: 500 }
      );
    }

    const translatedText = completion.choices[0]?.message?.content?.trim() ?? '';
    console.log('📄 Translated text preview:', translatedText.substring(0, 100));

    if (!translatedText) {
      console.error('❌ Empty response from OpenRouter API');
      return NextResponse.json(
        {
          error: 'Failed to translate',
          details: 'Empty response from OpenRouter API',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ translatedText });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Translation failed:', errorMessage);
    console.error('Full error:', error);
    return NextResponse.json(
      { error: 'Failed to translate', details: errorMessage },
      { status: 500 }
    );
  }
}
