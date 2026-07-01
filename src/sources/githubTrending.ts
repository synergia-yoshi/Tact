import type { SourceItem } from "../types.js";
import { fetchText } from "../utils/http.js";
import { cleanText } from "../utils/text.js";

export async function fetchGithubTrending(): Promise<SourceItem[]> {
  const html = await fetchText("https://github.com/trending?since=daily");
  const articles = [...html.matchAll(/<article class="Box-row"[\s\S]*?<\/article>/g)];
  const today = new Date().toISOString().slice(0, 10);

  return articles
    .map((match): SourceItem | null => {
      const article = match[0];
      const repoMatch = article.match(/href="\/([^/"]+)\/([^/"]+)"/);
      if (!repoMatch) return null;
      const repo = `${repoMatch[1]}/${repoMatch[2]}`;
      const descMatch = article.match(/<p[^>]*>([\s\S]*?)<\/p>/);
      const langMatch = article.match(/<span itemprop="programmingLanguage">([\s\S]*?)<\/span>/);
      const starsTodayMatch = article.match(/([\d,]+)\s+stars today/);
      const body = cleanText(descMatch?.[1] ?? "");
      return {
        id: `github-trending:${repo}`,
        sourceId: "github-trending",
        sourceName: "GitHub Trending",
        title: repo,
        url: `https://github.com/${repo}`,
        publishedAt: today,
        body,
        tags: [cleanText(langMatch?.[1] ?? ""), "oss"].filter(Boolean),
        points: starsTodayMatch ? Number(starsTodayMatch[1].replace(/,/g, "")) : undefined
      };
    })
    .filter((item): item is SourceItem => item != null);
}
