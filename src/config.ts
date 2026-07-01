import fs from "node:fs";
import path from "node:path";

export type HermesConfig = {
  anthropicApiKey?: string;
  slackWebhookUrl?: string;
  productHuntToken?: string;
  anthropicModel: string;
  anthropicEffort?: string;
  anthropicMaxTokens: number;
  dailyApiBudgetUsd: number;
  maxCandidatesPerRun: number;
  maxDeliveriesPerRun: number;
  ttpScoreThreshold: number;
  llmBatchSize: number;
  dryRun: boolean;
  enableProductHuntGraphql: boolean;
  enableGithubTrending: boolean;
  enableReddit: boolean;
  maxBodyCharsPerCandidate: number;
  slackTranslationMaxChars: number;
  hnHitsPerQuery: number;
  hnShowMinPoints: number;
  hnAskMinPoints: number;
  hnLaunchMinPoints: number;
  statePath: string;
  promptPath: string;
};

function loadDotEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function envString(name: string, fallback?: string): string | undefined {
  return process.env[name] || fallback;
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function loadConfig(): HermesConfig {
  loadDotEnv();
  return {
    anthropicApiKey: envString("ANTHROPIC_API_KEY"),
    slackWebhookUrl: envString("SLACK_WEBHOOK_URL"),
    productHuntToken: envString("PRODUCT_HUNT_TOKEN"),
    anthropicModel: envString("ANTHROPIC_MODEL", "claude-opus-4-8")!,
    anthropicEffort: envString("ANTHROPIC_EFFORT", "medium"),
    anthropicMaxTokens: envNumber("ANTHROPIC_MAX_TOKENS", 8000),
    dailyApiBudgetUsd: envNumber("HERMES_DAILY_API_BUDGET_USD", 1.5),
    maxCandidatesPerRun: envNumber("MAX_CANDIDATES_PER_RUN", 80),
    maxDeliveriesPerRun: envNumber("MAX_DELIVERIES_PER_RUN", 5),
    ttpScoreThreshold: envNumber("TTP_SCORE_THRESHOLD", 18),
    llmBatchSize: envNumber("LLM_BATCH_SIZE", 20),
    dryRun: envBool("DRY_RUN", false),
    enableProductHuntGraphql: envBool("ENABLE_PRODUCT_HUNT_GRAPHQL", Boolean(process.env.PRODUCT_HUNT_TOKEN)),
    enableGithubTrending: envBool("ENABLE_GITHUB_TRENDING", false),
    enableReddit: envBool("ENABLE_REDDIT", false),
    maxBodyCharsPerCandidate: envNumber("MAX_BODY_CHARS_PER_CANDIDATE", 4500),
    slackTranslationMaxChars: envNumber("SLACK_TRANSLATION_MAX_CHARS", 6500),
    hnHitsPerQuery: envNumber("HN_HITS_PER_QUERY", 30),
    hnShowMinPoints: envNumber("HN_SHOW_MIN_POINTS", 10),
    hnAskMinPoints: envNumber("HN_ASK_MIN_POINTS", 30),
    hnLaunchMinPoints: envNumber("HN_LAUNCH_MIN_POINTS", 20),
    statePath: envString("HERMES_STATE_PATH", "state/seen.json")!,
    promptPath: envString("TTP_PROMPT_PATH", "prompts/ttp_score.md")!
  };
}
