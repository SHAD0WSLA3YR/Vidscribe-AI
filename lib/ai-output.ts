/**
 * Separators for AI model output.
 *
 * How the separation works (per OpenRouter's design):
 * - Reasoning models expose chain-of-thought in a separate `reasoning` /
 *   `reasoning_details` field on each message, while `content` holds the
 *   final answer. Our routes only ever read `content`, so that field never
 *   leaks — and the explain route additionally sends
 *   `reasoning: { exclude: true }` so providers strip it server-side.
 * - But several free-tier reasoning models (Nemotron, Dots, DeepSeek-style)
 *   also inline their thinking into `content` itself, either wrapped in
 *   ` thinking`-style tags or as plain-text analysis ("Here's a thinking
 *   process..."). Those cases are handled here, client-side.
 */

/**
 * Request-body extension sent to OpenRouter on every chat-completions call.
 * Asks reasoning-capable models to skip chain-of-thought generation. Passed
 * by spreading into the SDK body object: the OpenAI SDK does not strip
 * unknown fields, so the key is forwarded verbatim to OpenRouter.
 */
export const REASONING_DISABLED = { reasoning: { enabled: false } } as const;

/** Matches <think>…</think>, <thinking>, <reason>/<reasoning>, <analysis> blocks. */
const THINK_BLOCK_PATTERN =
  /<(think|thinking|reason|reasoning|analysis)[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Matches a trailing unclosed opener (model was cut off mid-thinking). */
const UNCLOSED_THINK_PATTERN =
  /<(think|thinking|reason|reasoning|analysis)[^>]*>[\s\S]*$/i;

/**
 * Removes inline reasoning blocks from raw model output.
 * Returns the remaining text trimmed. Never throws.
 */
export function stripReasoningBlocks(text: string): string {
  if (!text) return '';
  return text
    .replace(THINK_BLOCK_PATTERN, '')
    .replace(UNCLOSED_THINK_PATTERN, '')
    .trim();
}

/**
 * Extracts the JSON object payload from raw model output.
 * Strips reasoning blocks and markdown fences, then slices from the first
 * `{` to the last `}` so leading commentary can't break JSON.parse.
 * Returns the best-effort string (may still be non-JSON — callers validate).
 */
export function extractJsonObject(text: string): string {
  let cleaned = stripReasoningBlocks(text);
  const fenced = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) {
    cleaned = fenced[1].trim();
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

/**
 * Cleans free-prose model output (explanations, summaries, titles,
 * translations): strips inline reasoning blocks and trims.
 */
export function cleanModelProse(text: string): string {
  return stripReasoningBlocks(text);
}

/**
 * Thinking-dump markers: phrases that appear in chain-of-thought
 * preambles but (almost) never in genuine answers. No single marker is
 * trusted on its own — callers require at least `threshold` distinct hits,
 * so legitimate content that merely mentions e.g. "thinking processes"
 * (a psychology lecture) is not misclassified.
 */
const THINKING_MARKERS: RegExp[] = [
  /thinking process/i,
  /analyz\w*\s+(the|your|this)\s+(input|request|transcript|excerpt)/i,
  /\bdeconstruct\w*\b/i,
  /identify\s+the\s+\S{0,30}\s+meaning/i,
  /here('s| is) my\s+(thinking|analysis|reasoning)/i,
  /let me\s+(re-?read|think|analyze|reason)\b/i,
  /^\s*\d+\.\s+\*\*.+\*\*/m,
];

/**
 * Returns true when text reads like a thinking dump rather than an answer.
 * Used to reject bad outputs and fall through to the next model instead of
 * showing reasoning to the user.
 */
export function looksLikeThinking(text: string, threshold = 2): boolean {
  if (!text) return false;
  let hits = 0;
  for (const marker of THINKING_MARKERS) {
    if (marker.test(text)) {
      hits += 1;
      if (hits >= threshold) return true;
    }
  }
  return false;
}
