// Precio por millon de tokens (USD) de los modelos que puede usar el bot. Haiku 5.5: tarifa para
// prompts <= 100K tokens (los del bot son de pocos miles). Cache: lectura 0.1x, escritura 5 min 1.25x.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

export const CHATBOT_MODELS = Object.keys(PRICES);

export interface ChatbotUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function chatbotCostUsd(model: string, u: ChatbotUsage): number {
  const p = PRICES[model] ?? PRICES['claude-haiku-5-5'];
  const perTok = (usd: number) => usd / 1_000_000;
  return (
    u.input_tokens * perTok(p.input) +
    (u.cache_read_input_tokens ?? 0) * perTok(p.input) * 0.1 +
    (u.cache_creation_input_tokens ?? 0) * perTok(p.input) * 1.25 +
    u.output_tokens * perTok(p.output)
  );
}
