import type { HermesConfig } from "../config.js";
import type { SlackPayload } from "./formatter.js";
import { fetchWithTimeout, sleep } from "../utils/http.js";

export async function postSlack(config: HermesConfig, payload: SlackPayload): Promise<void> {
  if (config.dryRun) {
    console.log("[slack] DRY_RUN payload:");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!config.slackWebhookUrl) {
    throw new Error("SLACK_WEBHOOK_URL is not set");
  }

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetchWithTimeout(
        config.slackWebhookUrl,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        },
        20_000
      );
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Slack HTTP ${response.status}: ${text}`);
      }
      console.log("[slack] posted");
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[slack] attempt ${attempt} failed: ${lastError.message}`);
      await sleep(attempt * 1500);
    }
  }

  throw lastError ?? new Error("Slack post failed");
}
