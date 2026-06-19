# Tact Cursor MVP v3

FastAPI server for a Tact campaign workflow MVP. The repository did not include
`Tact_Cursor開発指示書.md`, so this implementation proceeds with the following
explicit assumptions:

- MVP v3 is a server-side API for campaign planning, creative drafting,
  mock media submission, and mock performance retrieval.
- Media APIs and LLMs are implemented through mock adapters first.
- Adapter request/response models are shaped so real API clients can replace
  the mock implementations later without changing service code.
- Secrets are loaded only from server-side environment variables or `.env`.
  They are never committed and are not returned from public API responses.

## Local setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload
```

## Test

```bash
pytest
ruff check .
```

## API overview

- `GET /health` - service health and active adapter kinds.
- `POST /api/v1/campaigns/proposals` - create a campaign proposal from a brief.
- `GET /api/v1/campaigns` - list stored campaign proposals.
- `GET /api/v1/campaigns/{campaign_id}` - fetch a campaign proposal.
- `POST /api/v1/campaigns/{campaign_id}/publish` - submit a proposed campaign
  to the mock media API.
- `GET /api/v1/campaigns/{campaign_id}/performance` - fetch mock media
  performance for a submitted campaign.

Example proposal request:

```json
{
  "name": "June Launch",
  "objective": "lead_generation",
  "target_audience": "B2B SaaS operators in Japan",
  "total_budget_jpy": 300000,
  "channels": ["search", "social"],
  "kpis": ["qualified_leads", "cost_per_lead"],
  "tone": "confident and concise"
}
```

## Implemented milestones

- Milestone 1: server foundation, environment settings, mock LLM/media adapter
  interfaces, health endpoint, and focused tests.
- Milestone 2: campaign proposal workflow that combines mock LLM creative
  generation, mock media planning, in-memory persistence, and campaign APIs.
- Milestone 3: mock publish and performance workflow using the same media
  adapter boundary intended for real media API replacement.
