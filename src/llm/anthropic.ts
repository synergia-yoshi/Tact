import type { HermesConfig } from "../config.js";
import { estimateCostUsd, roundCost } from "../cost/pricing.js";
import { fetchWithTimeout } from "../utils/http.js";
import { estimateTokens } from "../utils/text.js";

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content: AnthropicTextBlock[];
  usage?: AnthropicUsage;
};

export type AnthropicCallResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export function estimateAnthropicCallCost(
  config: HermesConfig,
  promptText: string,
  estimatedOutputTokens: number
): number {
  return roundCost(
    estimateCostUsd(config.anthropicModel, estimateTokens(promptText), estimatedOutputTokens)
  );
}

export async function callAnthropic(
  config: HermesConfig,
  system: string,
  user: string
): Promise<AnthropicCallResult> {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const payload: Record<string, unknown> = {
    model: config.anthropicModel,
    max_tokens: config.anthropicMaxTokens,
    system,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: user }]
      }
    ]
  };

  if (config.anthropicEffort) {
    payload.output_config = { effort: config.anthropicEffort };
  }

  const response = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(payload)
    },
    120_000
  );

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  const parsed = JSON.parse(body) as AnthropicResponse;
  const text = parsed.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  const inputTokens =
    (parsed.usage?.input_tokens ?? 0) +
    (parsed.usage?.cache_creation_input_tokens ?? 0) +
    (parsed.usage?.cache_read_input_tokens ?? 0);
  const outputTokens = parsed.usage?.output_tokens ?? 0;
  const costUsd = roundCost(estimateCostUsd(config.anthropicModel, inputTokens, outputTokens));

  return { text, inputTokens, outputTokens, costUsd };
}
