export type ModelPricing = {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
};

const PRICES: Record<string, ModelPricing> = {
  "claude-opus-4-8": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  "claude-opus-4-7": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  "claude-opus-4-6": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  "claude-opus-4-5": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  "claude-sonnet-5": { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  "claude-sonnet-4-6": { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
  "claude-haiku-4-5": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
  "claude-haiku-4-5-20251001": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 }
};

export function pricingForModel(model: string): ModelPricing {
  return PRICES[model] ?? { inputUsdPerMTok: 5, outputUsdPerMTok: 25 };
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = pricingForModel(model);
  return (
    (inputTokens / 1_000_000) * pricing.inputUsdPerMTok +
    (outputTokens / 1_000_000) * pricing.outputUsdPerMTok
  );
}

export function roundCost(value: number): number {
  return Number(value.toFixed(6));
}
