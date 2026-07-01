import type { HermesConfig } from "../config.js";
import type { SourceItem } from "../types.js";
import { fetchWithTimeout } from "../utils/http.js";
import { cleanText } from "../utils/text.js";

type ProductHuntPost = {
  id: string;
  name: string;
  tagline?: string;
  url?: string;
  website?: string;
  votesCount?: number;
  commentsCount?: number;
  createdAt?: string;
};

type ProductHuntResponse = {
  data?: {
    posts?: {
      edges?: {
        node: ProductHuntPost;
      }[];
    };
  };
  errors?: { message: string }[];
};

export async function fetchProductHuntGraphql(config: HermesConfig): Promise<SourceItem[]> {
  if (!config.productHuntToken) {
    return [];
  }

  const query = `
    query HermesProductHuntPosts {
      posts(first: 30) {
        edges {
          node {
            id
            name
            tagline
            url
            website
            votesCount
            commentsCount
            createdAt
          }
        }
      }
    }
  `;

  const response = await fetchWithTimeout(
    "https://api.producthunt.com/v2/api/graphql",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.productHuntToken}`
      },
      body: JSON.stringify({ query })
    },
    30_000
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Product Hunt GraphQL HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  const parsed = JSON.parse(body) as ProductHuntResponse;
  if (parsed.errors?.length) {
    throw new Error(`Product Hunt GraphQL: ${parsed.errors.map((error) => error.message).join("; ")}`);
  }

  return (
    parsed.data?.posts?.edges?.map(({ node }) => ({
      id: `product-hunt-graphql:${node.id}`,
      sourceId: "product-hunt-graphql",
      sourceName: "Product Hunt GraphQL",
      title: cleanText(node.name),
      url: node.url || node.website || `https://www.producthunt.com/posts/${node.id}`,
      publishedAt: node.createdAt,
      body: cleanText(node.tagline),
      points: node.votesCount,
      tags: [`comments:${node.commentsCount ?? 0}`]
    })) ?? []
  );
}
