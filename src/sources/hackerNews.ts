import type { HermesConfig } from "../config.js";
import type { SourceItem } from "../types.js";
import { fetchJson } from "../utils/http.js";
import { cleanText } from "../utils/text.js";

type HnHit = {
  objectID: string;
  title?: string;
  story_title?: string;
  url?: string;
  story_url?: string;
  created_at?: string;
  points?: number;
  author?: string;
  _tags?: string[];
  story_text?: string;
  comment_text?: string;
};

type HnResponse = {
  hits: HnHit[];
};

type HnQuery = {
  sourceId: string;
  sourceName: string;
  tags: string;
  minPoints?: number;
};

function buildUrl(query: HnQuery, hitsPerPage: number): string {
  const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
  url.searchParams.set("tags", query.tags);
  url.searchParams.set("hitsPerPage", String(hitsPerPage));
  if (query.minPoints != null) {
    url.searchParams.set("numericFilters", `points>${query.minPoints}`);
  }
  return url.toString();
}

function normalizeHit(query: HnQuery, hit: HnHit): SourceItem | null {
  const title = cleanText(hit.title || hit.story_title);
  if (!title) return null;
  const hnUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
  const url = hit.url || hit.story_url || hnUrl;
  const body = cleanText(hit.story_text || hit.comment_text || title);

  return {
    id: `${query.sourceId}:${hit.objectID}`,
    sourceId: query.sourceId,
    sourceName: query.sourceName,
    title,
    url,
    publishedAt: hit.created_at,
    body,
    author: hit.author,
    points: hit.points,
    tags: hit._tags
  };
}

export async function fetchHackerNews(config: HermesConfig): Promise<SourceItem[]> {
  const queries: HnQuery[] = [
    {
      sourceId: "hn-front-page",
      sourceName: "Hacker News Front Page",
      tags: "front_page"
    },
    {
      sourceId: "hn-show-hn",
      sourceName: "Show HN",
      tags: "show_hn",
      minPoints: config.hnShowMinPoints
    },
    {
      sourceId: "hn-ask-hn",
      sourceName: "Ask HN",
      tags: "ask_hn",
      minPoints: config.hnAskMinPoints
    },
    {
      sourceId: "hn-launch-hn",
      sourceName: "Launch HN",
      tags: "launch_hn",
      minPoints: config.hnLaunchMinPoints
    }
  ];

  const all: SourceItem[] = [];
  for (const query of queries) {
    const response = await fetchJson<HnResponse>(buildUrl(query, config.hnHitsPerQuery));
    all.push(
      ...response.hits
        .map((hit) => normalizeHit(query, hit))
        .filter((item): item is SourceItem => item != null)
    );
  }
  return all;
}
