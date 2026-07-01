import { XMLParser } from "fast-xml-parser";
import type { SourceItem } from "../types.js";
import { fetchText } from "../utils/http.js";
import { cleanText, compactWhitespace, toArray } from "../utils/text.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: "#cdata",
  parseTagValue: false,
  trimValues: true
});

type RssFeed = {
  sourceId: string;
  sourceName: string;
  url: string;
};

function textValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["#cdata"] === "string") return obj["#cdata"];
    if (typeof obj["#text"] === "string") return obj["#text"];
  }
  return "";
}

function linkValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const alternate = value.find((entry) => entry?.["@_rel"] === "alternate") ?? value[0];
    return linkValue(alternate);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["@_href"] === "string") return obj["@_href"];
    if (typeof obj["#text"] === "string") return obj["#text"];
  }
  return "";
}

function normalizeRssItem(feed: RssFeed, item: Record<string, unknown>): SourceItem | null {
  const title = cleanText(textValue(item.title));
  const url = linkValue(item.link) || textValue(item.guid);
  if (!title || !url) return null;

  const body = compactWhitespace(
    cleanText(
      textValue(item["content:encoded"]) ||
        textValue(item["content"]) ||
        textValue(item.description) ||
        textValue(item.summary)
    )
  );

  return {
    id: `${feed.sourceId}:${textValue(item.guid) || url}`,
    sourceId: feed.sourceId,
    sourceName: feed.sourceName,
    title,
    url,
    publishedAt: textValue(item.pubDate) || textValue(item["dc:date"]) || undefined,
    body,
    author: textValue(item["dc:creator"]) || textValue(item.author) || undefined,
    tags: toArray(item.category).map((category) => cleanText(textValue(category))).filter(Boolean)
  };
}

function normalizeAtomEntry(feed: RssFeed, entry: Record<string, unknown>): SourceItem | null {
  const title = cleanText(textValue(entry.title));
  const url = linkValue(entry.link);
  if (!title || !url) return null;

  const body = compactWhitespace(
    cleanText(textValue(entry.content) || textValue(entry.summary) || textValue(entry.subtitle))
  );

  return {
    id: `${feed.sourceId}:${textValue(entry.id) || url}`,
    sourceId: feed.sourceId,
    sourceName: feed.sourceName,
    title,
    url,
    publishedAt: textValue(entry.updated) || textValue(entry.published) || undefined,
    body,
    author: textValue((entry.author as Record<string, unknown> | undefined)?.name) || undefined,
    tags: toArray(entry.category)
      .map((category) => {
        if (typeof category === "object" && category) {
          return cleanText(String((category as Record<string, unknown>)["@_term"] ?? ""));
        }
        return cleanText(textValue(category));
      })
      .filter(Boolean)
  };
}

export async function fetchRssFeed(feed: RssFeed): Promise<SourceItem[]> {
  const xml = await fetchText(feed.url);
  const parsed = parser.parse(xml) as Record<string, unknown>;

  const rss = parsed.rss as Record<string, unknown> | undefined;
  if (rss?.channel && typeof rss.channel === "object") {
    const channel = rss.channel as Record<string, unknown>;
    return toArray(channel.item as Record<string, unknown> | Record<string, unknown>[])
      .map((item) => normalizeRssItem(feed, item))
      .filter((item): item is SourceItem => item != null);
  }

  const atom = parsed.feed as Record<string, unknown> | undefined;
  if (atom) {
    return toArray(atom.entry as Record<string, unknown> | Record<string, unknown>[])
      .map((entry) => normalizeAtomEntry(feed, entry))
      .filter((item): item is SourceItem => item != null);
  }

  throw new Error(`Unsupported feed format: ${feed.url}`);
}

export const RSS_FEEDS: RssFeed[] = [
  {
    sourceId: "product-hunt-rss",
    sourceName: "Product Hunt RSS",
    url: "https://www.producthunt.com/feed"
  },
  {
    sourceId: "techmeme-rss",
    sourceName: "Techmeme",
    url: "https://www.techmeme.com/feed.xml"
  },
  {
    sourceId: "techcrunch-startups-rss",
    sourceName: "TechCrunch Startups",
    url: "https://techcrunch.com/category/startups/feed/"
  },
  {
    sourceId: "techcrunch-funding-rss",
    sourceName: "TechCrunch Funding",
    url: "https://techcrunch.com/tag/funding/feed/"
  },
  {
    sourceId: "yc-blog-rss",
    sourceName: "Y Combinator Blog",
    url: "https://www.ycombinator.com/blog/rss"
  },
  {
    sourceId: "a16z-news-rss",
    sourceName: "a16z News",
    url: "https://www.a16z.news/feed"
  },
  {
    sourceId: "first-round-review-rss",
    sourceName: "First Round Review",
    url: "https://review.firstround.com/articles/rss/"
  }
];

export const REDDIT_FEEDS: RssFeed[] = [
  {
    sourceId: "reddit-saas",
    sourceName: "Reddit r/SaaS",
    url: "https://www.reddit.com/r/SaaS/.rss"
  },
  {
    sourceId: "reddit-startups",
    sourceName: "Reddit r/startups",
    url: "https://www.reddit.com/r/startups/.rss"
  }
];
