import { loadConfig } from "../src/config.js";
import type { RunStats, ScoredItem } from "../src/types.js";
import { formatDigestPayload } from "../src/slack/formatter.js";

const config = {
  ...loadConfig(),
  dryRun: true
};

const fixture: ScoredItem[] = [
  {
    id: "dummy:launch-hn",
    sourceId: "hn-launch-hn",
    sourceName: "Launch HN",
    title: "Launch HN: Example Agents (YC S26) - AI SDRs for vertical SaaS",
    titleJapanese: "Launch HN: Example Agents - 業界特化SaaS向けAI SDR",
    url: "https://news.ycombinator.com/item?id=000000",
    publishedAt: new Date().toISOString(),
    body: "Example Agents automates outbound research and qualification for vertical SaaS companies.",
    points: 120,
    tags: ["launch_hn", "yc"],
    rankScore: 72,
    shouldDeliver: true,
    ttpTotalScore: 21.4,
    axes: {
      imitability: { score: 4.5, reason_japanese: "既存LLMと業務データ連携で再現可能。" },
      timing: { score: 4.2, reason_japanese: "AI SDRの導入検討が日本でも増えている。" },
      japan_transferability: { score: 4.1, reason_japanese: "業界特化と日本語営業文脈に寄せやすい。" },
      breakthrough: { score: 3.8, reason_japanese: "単なるメール生成ではなく調査と判定まで含む。" },
      adjacency: { score: 3.2, reason_japanese: "Tactのmartech領域に隣接。" }
    },
    ttpActionJapanese:
      "日本では業界特化のAI SDRとして、まず人材・教育・B2B SaaSの狭いリスト作成から入る。Tact側の顧客データ活用と接続すると初期価値が出しやすい。",
    whyItWorksJapanese:
      "営業人員不足とAI導入予算の増加が重なっているため、完全自動化よりも調査・優先度付けの半自動化が刺さる。",
    fullTranslationJapanese:
      "Example Agentsは、業界特化SaaS企業向けにアウトバウンド営業の調査と見込み客判定を自動化する。顧客の業界、導入可能性、既存ツール構成を調べ、営業担当が次に連絡すべき相手を優先順位付きで提示する。",
    riskNoteJapanese: "差別化には独自データかワークフロー統合が必要。"
  }
];

const stats: RunStats = {
  startedAt: new Date().toISOString(),
  fetchedCount: 42,
  candidateCount: 12,
  scoredCount: 12,
  deliveredCount: fixture.length,
  apiCostUsd: 0,
  sourceCounts: { "hn-launch-hn": 3, "product-hunt-rss": 20 },
  sourceErrors: {}
};

console.log(JSON.stringify(formatDigestPayload(fixture, stats, config), null, 2));
