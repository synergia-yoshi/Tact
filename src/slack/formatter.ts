import type { HermesConfig } from "../config.js";
import type { RunStats, ScoredItem } from "../types.js";
import { splitForSlack, truncate } from "../utils/text.js";

type SlackBlock =
  | {
      type: "header";
      text: { type: "plain_text"; text: string; emoji?: boolean };
    }
  | {
      type: "section";
      text: { type: "mrkdwn"; text: string };
    }
  | {
      type: "context";
      elements: { type: "mrkdwn"; text: string }[];
    }
  | {
      type: "divider";
    };

export type SlackPayload = {
  text: string;
  blocks: SlackBlock[];
};

function scoreLine(item: ScoredItem): string {
  const axes = item.axes;
  return [
    `模倣 ${axes.imitability.score}`,
    `旬 ${axes.timing.score}`,
    `日本 ${axes.japan_transferability.score}`,
    `非連続 ${axes.breakthrough.score}`,
    `隣接 ${axes.adjacency.score}`
  ].join(" / ");
}

function itemBlocks(item: ScoredItem, index: number, config: HermesConfig): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${index}. ${item.titleJapanese || item.title}*\n` +
          `*日本でパクるなら*: ${item.ttpActionJapanese || "要検討"}`
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text:
            `TTP *${item.ttpTotalScore.toFixed(1)}/25* | ${scoreLine(item)} | ` +
            `<${item.url}|${item.sourceName}>`
        }
      ]
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*なぜ効くか*: ${item.whyItWorksJapanese || "LLM短評なし"}`
      }
    }
  ];

  if (item.riskNoteJapanese) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*注意*: ${item.riskNoteJapanese}`
      }
    });
  }

  const translation = truncate(
    item.fullTranslationJapanese || "翻訳対象の本文がありません。",
    config.slackTranslationMaxChars
  );
  for (const [chunkIndex, chunk] of splitForSlack(translation).entries()) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${chunkIndex === 0 ? "*本文訳*\n" : ""}${chunk}`
      }
    });
  }

  return blocks;
}

export function formatDigestPayload(
  delivered: ScoredItem[],
  stats: RunStats,
  config: HermesConfig
): SlackPayload {
  const today = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(new Date());

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Hermes TTP Digest ${today}`, emoji: false }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `取得 ${stats.fetchedCount}件 / 採点 ${stats.scoredCount}件 / 配信 ${delivered.length}件 / ` +
          `API概算 $${stats.apiCostUsd.toFixed(4)}`
      }
    }
  ];

  for (const [index, item] of delivered.entries()) {
    if (blocks.length > 44) break;
    blocks.push({ type: "divider" }, ...itemBlocks(item, index + 1, config));
  }

  return {
    text: `Hermes TTP Digest: ${delivered.length}件`,
    blocks: blocks.slice(0, 50)
  };
}

export function formatNoMatchesPayload(stats: RunStats): SlackPayload {
  return {
    text: "Hermes: 本日該当なし",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Hermes: 本日該当なし", emoji: false }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `高スコア案件はありませんでした。\n` +
            `取得 ${stats.fetchedCount}件 / 採点 ${stats.scoredCount}件 / API概算 $${stats.apiCostUsd.toFixed(4)}`
        }
      }
    ]
  };
}

export function formatBudgetStoppedPayload(stats: RunStats, budgetUsd: number): SlackPayload {
  return {
    text: "Hermes: API予算上限で停止",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Hermes: API予算上限で停止", emoji: false }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `日次API予算 $${budgetUsd.toFixed(2)} を超えそうだったため、途中で停止しました。\n` +
            `取得 ${stats.fetchedCount}件 / 採点 ${stats.scoredCount}件 / API概算 $${stats.apiCostUsd.toFixed(4)}`
        }
      }
    ]
  };
}

export function formatErrorPayload(message: string): SlackPayload {
  return {
    text: `Hermes error: ${message}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Hermes Error", emoji: false }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `\`${message.slice(0, 2500)}\`` }
      }
    ]
  };
}
