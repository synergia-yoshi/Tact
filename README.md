# Hermes

Hermes is a personal Silicon Valley startup intelligence bot for a Japanese startup founder. It gathers overseas startup signals every morning, scores them from a TTP perspective, and posts only high-value items to Slack.

## What Hermes Watches

v1 sources:

- Hacker News via Algolia: front page, Show HN, Ask HN, Launch HN
- Product Hunt RSS, with optional GraphQL enrichment later
- Techmeme RSS
- TechCrunch RSS
- YC Blog RSS
- a16z News RSS
- First Round Review articles RSS
- Optional: GitHub Trending and Reddit RSS, disabled by default because they are less stable/noisier

## Required Secrets

This repository is intended to be public. Never commit API keys or webhook URLs.

Public repository secret leaks can lead to immediate unauthorized API usage and Slack abuse. Store all secrets in GitHub repository secrets:

- `ANTHROPIC_API_KEY`
- `SLACK_WEBHOOK_URL`
- `PRODUCT_HUNT_TOKEN` optional, only if Product Hunt GraphQL is enabled

For local testing, use `.env` only. `.env` is ignored by git. Commit `.env.example`, not `.env`.

## Schedule

The workflow lives at `.github/workflows/hermes.yml`.

- Desired delivery: JST 7:00
- GitHub Actions cron timezone: UTC
- Cron used: `7 22 * * *`, which is 22:07 UTC on the previous day
- Minute `0` is intentionally avoided to reduce top-of-hour congestion
- `workflow_dispatch` is enabled for manual runs

Important GitHub Actions trap: scheduled workflows in public repositories can be automatically disabled if the repository has no push activity for 60 days. Mitigations:

- Make a small config/docs update periodically.
- Keep the daily "no matches" Slack notification enabled as a heartbeat.
- If the heartbeat disappears, check whether GitHub disabled the scheduled workflow.

## State Persistence

GitHub Actions runners are ephemeral. Local files disappear after each run unless committed.

Hermes stores delivered item IDs in `state/seen.json`. After each run, the workflow commits that file back to the repository using `contents: write`. This prevents duplicate delivery on later days without adding a database or paid service.

## Cost Guardrail

Hermes defaults to Opus 4.8:

```text
ANTHROPIC_MODEL=claude-opus-4-8
HERMES_DAILY_API_BUDGET_USD=1.50
MAX_CANDIDATES_PER_RUN=80
MAX_DELIVERIES_PER_RUN=5
TTP_SCORE_THRESHOLD=18
```

The app estimates cost before each LLM batch and records actual usage from Anthropic responses. If the daily budget would be exceeded, Hermes stops and sends a Slack alert.

## Local Setup

```bash
npm install
cp .env.example .env
npm run build
npm run dummy
```

`npm run dummy` does not call Anthropic and does not require Slack. It renders a preview of the C-format Slack digest using fixture data.

For a live dry run:

```bash
DRY_RUN=true npm start
```

If `ANTHROPIC_API_KEY` is absent, dry run uses mock scoring so you can verify source fetching and Slack formatting without spending API credits. If the key is present, dry run uses the real model but does not post to Slack or mutate `state/seen.json`.

For a real run, set `ANTHROPIC_API_KEY` and `SLACK_WEBHOOK_URL`, then:

```bash
npm start
```

## Slack Format

Hermes uses format C:

1. What should be copied or adapted in Japan
2. TTP score and five-axis breakdown
3. Why it works
4. Japanese translation of the provided source body
5. Source URL

Zero-match days still post "本日該当なし" so the Slack channel doubles as a heartbeat monitor.
