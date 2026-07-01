import fs from "node:fs";
import type { HermesConfig } from "../config.js";
import { estimateAnthropicCallCost, callAnthropic } from "../llm/anthropic.js";
import type { CandidateItem, ScoredItem, SeenState } from "../types.js";
import { jstDateKey } from "../state/seenStore.js";
import { estimateTokens, truncate } from "../utils/text.js";

type RawScoredItem = {
  id: string;
  should_deliver: boolean;
  title_japanese?: string;
  ttp_total_score?: number;
  axes?: ScoredItem["axes"];
  ttp_action_japanese?: string;
  why_it_works_japanese?: string;
  full_translation_japanese?: string;
  risk_note_japanese?: string;
};

type RawScoringResponse = {
  items: RawScoredItem[];
};

export type ScoringResult = {
  items: ScoredItem[];
  costUsd: number;
  stoppedForBudget: boolean;
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function extractJson(text: string): RawScoringResponse {
  const withoutFence = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(withoutFence) as RawScoringResponse;
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(withoutFence.slice(start, end + 1)) as RawScoringResponse;
    }
    throw new Error(`Failed to parse LLM JSON: ${text.slice(0, 500)}`);
  }
}

function emptyAxes(): ScoredItem["axes"] {
  const empty = { score: 0, reason_japanese: "" };
  return {
    imitability: { ...empty },
    timing: { ...empty },
    japan_transferability: { ...empty },
    breakthrough: { ...empty },
    adjacency: { ...empty }
  };
}

function normalizeScoredItem(candidate: CandidateItem, raw?: RawScoredItem): ScoredItem {
  const total = Number(raw?.ttp_total_score ?? 0);
  return {
    ...candidate,
    shouldDeliver: Boolean(raw?.should_deliver),
    titleJapanese: raw?.title_japanese ?? candidate.title,
    ttpTotalScore: Number.isFinite(total) ? total : 0,
    axes: raw?.axes ?? emptyAxes(),
    ttpActionJapanese: raw?.ttp_action_japanese ?? "",
    whyItWorksJapanese: raw?.why_it_works_japanese ?? "",
    fullTranslationJapanese: raw?.full_translation_japanese ?? "",
    riskNoteJapanese: raw?.risk_note_japanese ?? ""
  };
}

function buildUserPrompt(
  candidates: CandidateItem[],
  config: HermesConfig
): string {
  const candidatePayload = candidates.map((candidate) => ({
    id: candidate.id,
    source: candidate.sourceName,
    title: candidate.title,
    url: candidate.url,
    published_at: candidate.publishedAt,
    points: candidate.points,
    tags: candidate.tags,
    body: truncate(candidate.body || candidate.title, config.maxBodyCharsPerCandidate)
  }));

  return JSON.stringify(
    {
      threshold: config.ttpScoreThreshold,
      instruction:
        "Score these candidates for TTP value. Translate the full provided body only for candidates at or above threshold.",
      candidates: candidatePayload
    },
    null,
    2
  );
}

function currentDailyCost(state: SeenState): number {
  return state.dailyCosts[jstDateKey()] ?? 0;
}

export async function scoreCandidates(
  candidates: CandidateItem[],
  state: SeenState,
  config: HermesConfig
): Promise<ScoringResult> {
  const system = fs.readFileSync(config.promptPath, "utf8");
  const scored: ScoredItem[] = [];
  let spent = 0;
  let stoppedForBudget = false;

  for (const batch of chunk(candidates, config.llmBatchSize)) {
    const user = buildUserPrompt(batch, config);
    const promptForEstimate = `${system}\n${user}`;
    const estimatedOutputTokens = Math.min(
      config.anthropicMaxTokens,
      batch.length * 450 + config.maxDeliveriesPerRun * 900
    );
    const estimatedCost = estimateAnthropicCallCost(config, promptForEstimate, estimatedOutputTokens);
    const alreadySpent = currentDailyCost(state) + spent;

    if (alreadySpent + estimatedCost > config.dailyApiBudgetUsd) {
      console.warn(
        `[budget] stopping before LLM batch: spent=${alreadySpent.toFixed(4)} estimated=${estimatedCost.toFixed(4)} budget=${config.dailyApiBudgetUsd.toFixed(2)}`
      );
      stoppedForBudget = true;
      break;
    }

    console.log(
      `[llm] scoring batch size=${batch.length} estimatedInputTokens=${estimateTokens(promptForEstimate)}`
    );
    const response = await callAnthropic(config, system, user);
    spent += response.costUsd;
    console.log(
      `[llm] usage input=${response.inputTokens} output=${response.outputTokens} cost=$${response.costUsd.toFixed(4)}`
    );

    const parsed = extractJson(response.text);
    const byId = new Map(parsed.items.map((item) => [item.id, item]));
    scored.push(...batch.map((candidate) => normalizeScoredItem(candidate, byId.get(candidate.id))));
  }

  return { items: scored, costUsd: spent, stoppedForBudget };
}

export function mockScoreCandidates(
  candidates: CandidateItem[],
  config: HermesConfig
): ScoringResult {
  const items = candidates.slice(0, Math.min(candidates.length, config.maxDeliveriesPerRun)).map(
    (candidate, index): ScoredItem => ({
      ...candidate,
      shouldDeliver: index < Math.min(2, config.maxDeliveriesPerRun),
      titleJapanese: `[mock] ${candidate.title}`,
      ttpTotalScore: index < 2 ? config.ttpScoreThreshold + 1 - index * 0.5 : 10,
      axes: {
        imitability: { score: 4, reason_japanese: "モック採点です。" },
        timing: { score: 4, reason_japanese: "モック採点です。" },
        japan_transferability: { score: 4, reason_japanese: "モック採点です。" },
        breakthrough: { score: 3, reason_japanese: "モック採点です。" },
        adjacency: { score: 3, reason_japanese: "モック採点です。" }
      },
      ttpActionJapanese:
        "これはAPIキーなしのDRY_RUN用モックです。実運用ではOpus 4.8がTTP観点で採点します。",
      whyItWorksJapanese: "Slack表示とstate処理の形を確認するための仮文です。",
      fullTranslationJapanese: truncate(candidate.body || candidate.title, 800),
      riskNoteJapanese: "モック結果なので意思決定には使わないでください。"
    })
  );
  return { items, costUsd: 0, stoppedForBudget: false };
}
