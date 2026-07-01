import type { HermesConfig } from "../config.js";
import type { CandidateItem, SeenState, SourceItem } from "../types.js";
import { cleanText, stableUrlKey } from "../utils/text.js";

const KEYWORDS = [
  "ai",
  "agent",
  "agents",
  "automation",
  "workflow",
  "b2b",
  "saas",
  "martech",
  "marketing",
  "sales",
  "crm",
  "growth",
  "analytics",
  "customer",
  "japan",
  "language",
  "learning",
  "education",
  "workforce",
  "immigration",
  "talent",
  "hiring",
  "yc",
  "launch",
  "open source",
  "developer",
  "productivity",
  "vertical",
  "marketplace"
];

const SOURCE_BOOST: Record<string, number> = {
  "hn-launch-hn": 28,
  "hn-show-hn": 24,
  "product-hunt-rss": 18,
  "techmeme-rss": 16,
  "techcrunch-startups-rss": 16,
  "techcrunch-funding-rss": 16,
  "hn-front-page": 14,
  "hn-ask-hn": 10,
  "yc-blog-rss": 9,
  "a16z-news-rss": 9,
  "first-round-review-rss": 8,
  "github-trending": 8
};

function keywordScore(item: SourceItem): number {
  const haystack = `${item.title}\n${item.body ?? ""}\n${item.tags?.join(" ") ?? ""}`.toLowerCase();
  return KEYWORDS.reduce((score, keyword) => score + (haystack.includes(keyword) ? 3 : 0), 0);
}

function pointsScore(points?: number): number {
  if (!points || points <= 0) return 0;
  return Math.min(20, Math.log10(points + 1) * 8);
}

function recencyScore(publishedAt?: string): number {
  if (!publishedAt) return 0;
  const published = new Date(publishedAt).getTime();
  if (!Number.isFinite(published)) return 0;
  const ageHours = (Date.now() - published) / 3_600_000;
  if (ageHours <= 24) return 12;
  if (ageHours <= 72) return 8;
  if (ageHours <= 168) return 4;
  return 0;
}

function rankItem(item: SourceItem): number {
  return (
    (SOURCE_BOOST[item.sourceId] ?? 4) +
    keywordScore(item) +
    pointsScore(item.points) +
    recencyScore(item.publishedAt)
  );
}

export function prefilterCandidates(
  items: SourceItem[],
  state: SeenState,
  config: HermesConfig
): CandidateItem[] {
  const seen = new Set(state.seenIds);
  const deduped = new Map<string, SourceItem>();

  for (const item of items) {
    if (seen.has(item.id)) continue;
    const urlKey = stableUrlKey(item.url);
    const existing = deduped.get(urlKey);
    if (!existing || rankItem(item) > rankItem(existing)) {
      deduped.set(urlKey, {
        ...item,
        title: cleanText(item.title),
        body: cleanText(item.body)
      });
    }
  }

  return [...deduped.values()]
    .map((item) => ({ ...item, rankScore: rankItem(item) }))
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, config.maxCandidatesPerRun);
}
