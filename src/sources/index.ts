import type { HermesConfig } from "../config.js";
import type { RunStats, SourceItem } from "../types.js";
import { fetchHackerNews } from "./hackerNews.js";
import { fetchGithubTrending } from "./githubTrending.js";
import { fetchProductHuntGraphql } from "./productHuntGraphql.js";
import { REDDIT_FEEDS, RSS_FEEDS, fetchRssFeed } from "./rss.js";

type SourceFetch = {
  id: string;
  fetch: () => Promise<SourceItem[]>;
};

export async function fetchAllSources(
  config: HermesConfig,
  stats: RunStats
): Promise<SourceItem[]> {
  const fetches: SourceFetch[] = [
    {
      id: "hacker-news",
      fetch: () => fetchHackerNews(config)
    },
    ...RSS_FEEDS.map((feed) => ({
      id: feed.sourceId,
      fetch: () => fetchRssFeed(feed)
    }))
  ];

  if (config.enableGithubTrending) {
    fetches.push({ id: "github-trending", fetch: fetchGithubTrending });
  }

  if (config.enableProductHuntGraphql) {
    fetches.push({ id: "product-hunt-graphql", fetch: () => fetchProductHuntGraphql(config) });
  }

  if (config.enableReddit) {
    fetches.push(
      ...REDDIT_FEEDS.map((feed) => ({
        id: feed.sourceId,
        fetch: () => fetchRssFeed(feed)
      }))
    );
  }

  const all: SourceItem[] = [];
  for (const source of fetches) {
    try {
      const items = await source.fetch();
      stats.sourceCounts[source.id] = items.length;
      all.push(...items);
      console.log(`[source] ${source.id}: ${items.length}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stats.sourceErrors[source.id] = message;
      console.warn(`[source] ${source.id} failed: ${message}`);
    }
  }
  stats.fetchedCount = all.length;
  return all;
}
