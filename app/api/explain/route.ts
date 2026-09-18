import { NextResponse } from 'next/server';

const AI_CONFIG = {
  USE_REAL_API: true, // Always use real API
  API_KEY: process.env.OPENROUTER_API_KEY ?? '',
  BASE_URL:
    process.env.OPENROUTER_BASE_URL ??
    'https://openrouter.ai/api/v1/chat/completions',
  MODEL:
    process.env.OPENROUTER_MODEL ?? 'nvidia/nemotron-3.5-lightning:free',
  SITE_URL:
    process.env.OPENROUTER_SITE_URL ??
    'https://clover-amount-02442961.figma.site',
  SITE_NAME: process.env.OPENROUTER_APP_NAME ?? 'IdeaScape',
  MAX_TOKENS: {
    SUMMARY: Number(process.env.OPENROUTER_MAX_TOKENS_SUMMARY ?? 600),
    CONNECTIONS: Number(process.env.OPENROUTER_MAX_TOKENS_CONNECTIONS ?? 800),
    GROUP_NAMES: Number(process.env.OPENROUTER_MAX_TOKENS_GROUP_NAMES ?? 400),
    CHAT: Number(process.env.OPENROUTER_MAX_TOKENS_CHAT ?? 800),
    SMART_SUMMARY: Number(
      process.env.OPENROUTER_MAX_TOKENS_SMART_SUMMARY ?? 1000
    ),
  },
  TEMPERATURE: Number(process.env.OPENROUTER_TEMPERATURE ?? 0.7),
  TOP_P: Number(process.env.OPENROUTER_TOP_P ?? 0.9),
  TIMEOUT: Number(process.env.OPENROUTER_TIMEOUT_MS ?? 60000),
} as const;

const FALLBACK_MODELS = [
  'nvidia/nemotron-3.5-lightning:free',
  'dots-studio/dots-3-note-preview:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];
const OPENROUTER_TIMEOUT_MS = AI_CONFIG.TIMEOUT;

function parseEnvList(value: string | undefined): string[] {
  return (
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function resolveApiKeys(): string[] {
  const fromList = parseEnvList(process.env.OPENROUTER_API_KEYS);
  const single = AI_CONFIG.API_KEY ? [AI_CONFIG.API_KEY] : [];
  return [...fromList, ...single].filter(Boolean);
}

function resolveModels(): string[] {
  const fromEnv = parseEnvList(process.env.OPENROUTER_MODEL_LIST);
  const primary = AI_CONFIG.MODEL ? [AI_CONFIG.MODEL] : [];
  const defaults = primary.length > 0 ? primary : FALLBACK_MODELS;
  return (fromEnv.length > 0 ? fromEnv : defaults).filter(Boolean);
}

interface ExplainRequest {
  text: string;
  context?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
}

class OpenRouterError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const SITE_URL = AI_CONFIG.SITE_URL;
const APP_NAME = AI_CONFIG.SITE_NAME;

async function requestOpenRouter(
  apiKey: string,
  model: string,
  payload: Record<string, unknown>
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const responseBody = await response.text();

    if (!response.ok) {
      throw new OpenRouterError(
        `Request failed with status ${response.status}`,
        response.status,
        responseBody
      );
    }

    return JSON.parse(responseBody) as {
      choices?: Array<{
        message?: { content?: string | null };
      }>;
    };
  } catch (error) {
    if (error instanceof OpenRouterError) {
      throw error;
    }

    if ((error as Error)?.name === 'AbortError') {
      throw new OpenRouterError('Request timed out', 408, '');
    }

    throw new OpenRouterError(
      error instanceof Error ? error.message : 'Unknown request error',
      500,
      ''
    );
  } finally {
    clearTimeout(timer);
  }
}

function truncateBody(body: string, maxLength = 200) {
  const clean = body.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength)}…`;
}

export async function POST(request: Request) {
  const apiKeys = resolveApiKeys();
  const models = resolveModels();

  if (apiKeys.length === 0) {
    return NextResponse.json(
      { error: 'No OpenRouter API keys configured' },
      { status: 500 }
    );
  }

  const {
    text,
    context,
    level = 'beginner',
  } = (await request.json()) as ExplainRequest;
  if (!text) {
    return NextResponse.json(
      { error: 'Text to explain is required' },
      { status: 400 }
    );
  }

  if (!AI_CONFIG.USE_REAL_API) {
    return NextResponse.json(
      { error: 'Real API access is disabled in configuration.' },
      { status: 503 }
    );
  }

  // Debug logging
  console.log('OpenRouter API Key present:', !!AI_CONFIG.API_KEY);
  console.log('Using models:', models);
  console.log('API Keys available:', apiKeys.length);

  const levelPrompt =
    level === 'advanced'
      ? 'Provide a technical explanation suitable for graduate-level students.'
      : level === 'intermediate'
      ? 'Explain in clear technical language suitable for an undergraduate audience.'
      : 'Explain it as if to a beginner, using approachable analogies when helpful.';

  const attempts: string[] = [];

  for (const apiKey of apiKeys) {
    for (const model of models) {
      const payload = {
        model,
        temperature: AI_CONFIG.TEMPERATURE,
        top_p: AI_CONFIG.TOP_P,
        max_tokens: AI_CONFIG.MAX_TOKENS.SUMMARY,
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              'You clarify lecture transcripts. Return a short explanation (max 5 sentences) and, if helpful, include 1-2 bullet points highlighting key takeaways.',
          },
          {
            role: 'user',
            content: [
              levelPrompt,
              context ? `Context: ${context}` : null,
              'Explain the following excerpt in natural language:',
              text,
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
      };

      try {
        const completion = await requestOpenRouter(apiKey, model, payload);
        const explanation =
          completion.choices?.[0]?.message?.content?.trim() ?? '';

        if (!explanation) {
          attempts.push(
            `model="${model}" status=200 message="Empty response content"`
          );
          continue;
        }

        return NextResponse.json({ explanation, model });
      } catch (error) {
        const status = error instanceof OpenRouterError ? error.status : 500;
        const body = error instanceof OpenRouterError ? error.body : '';
        const message =
          error instanceof Error ? error.message : 'Unknown request error';

        const attemptLabel = `model="${model}" status=${status} message="${message}"${
          body ? ` body="${truncateBody(body)}"` : ''
        }`;
        attempts.push(attemptLabel);
        console.error('Explain API attempt failed', attemptLabel);
      }
    }
  }

  return NextResponse.json(
    {
      error: 'Failed to generate explanation after trying available models',
      attempts,
    },
    { status: 502 }
  );
}
