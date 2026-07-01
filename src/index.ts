import { loadConfig } from "./config.js";
import { addDailyCost, addDeliveredIds, loadSeenState, saveSeenState } from "./state/seenStore.js";
import { fetchAllSources } from "./sources/index.js";
import { prefilterCandidates } from "./scoring/prefilter.js";
import { mockScoreCandidates, scoreCandidates } from "./scoring/ttpScorer.js";
import type { RunStats, ScoredItem } from "./types.js";
import {
  formatBudgetStoppedPayload,
  formatDigestPayload,
  formatErrorPayload,
  formatNoMatchesPayload
} from "./slack/formatter.js";
import { postSlack } from "./slack/client.js";

function initStats(): RunStats {
  return {
    startedAt: new Date().toISOString(),
    fetchedCount: 0,
    candidateCount: 0,
    scoredCount: 0,
    deliveredCount: 0,
    apiCostUsd: 0,
    sourceCounts: {},
    sourceErrors: {}
  };
}

function selectDelivered(items: ScoredItem[], threshold: number, max: number): ScoredItem[] {
  return items
    .filter((item) => item.shouldDeliver && item.ttpTotalScore >= threshold)
    .sort((a, b) => b.ttpTotalScore - a.ttpTotalScore)
    .slice(0, max);
}

async function run(): Promise<void> {
  const config = loadConfig();
  const stats = initStats();
  const state = loadSeenState(config.statePath);

  if (!config.anthropicApiKey && !config.dryRun) {
    throw new Error("ANTHROPIC_API_KEY is required for a real run");
  }

  const sourceItems = await fetchAllSources(config, stats);
  const candidates = prefilterCandidates(sourceItems, state, config);
  stats.candidateCount = candidates.length;
  console.log(`[prefilter] ${sourceItems.length} fetched -> ${candidates.length} candidates`);

  if (candidates.length === 0) {
    await postSlack(config, formatNoMatchesPayload(stats));
    return;
  }

  const scoring =
    config.dryRun && !config.anthropicApiKey
      ? mockScoreCandidates(candidates, config)
      : await scoreCandidates(candidates, state, config);
  stats.apiCostUsd = scoring.costUsd;
  stats.scoredCount = scoring.items.length;

  const delivered = selectDelivered(
    scoring.items,
    config.ttpScoreThreshold,
    config.maxDeliveriesPerRun
  );
  stats.deliveredCount = delivered.length;

  if (delivered.length > 0) {
    await postSlack(config, formatDigestPayload(delivered, stats, config));
  } else if (scoring.stoppedForBudget) {
    await postSlack(config, formatBudgetStoppedPayload(stats, config.dailyApiBudgetUsd));
  } else {
    await postSlack(config, formatNoMatchesPayload(stats));
  }

  if (!config.dryRun) {
    const nextState = addDailyCost(
      addDeliveredIds(
        state,
        delivered.map((item) => item.id)
      ),
      scoring.costUsd
    );
    saveSeenState(config.statePath, nextState);
  } else {
    console.log("[state] DRY_RUN: not mutating state/seen.json");
  }

  console.log(
    `[summary] fetched=${stats.fetchedCount} candidates=${stats.candidateCount} scored=${stats.scoredCount} delivered=${stats.deliveredCount} apiCost=$${stats.apiCostUsd.toFixed(4)}`
  );
}

run().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[fatal] ${message}`);
  try {
    const config = loadConfig();
    if (config.slackWebhookUrl || config.dryRun) {
      await postSlack(config, formatErrorPayload(message));
    }
  } catch (slackError) {
    console.error(`[fatal] failed to send Slack error: ${slackError}`);
  }
  process.exitCode = 1;
});
