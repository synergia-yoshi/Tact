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

## Implemented milestones

- Milestone 1: server foundation, environment settings, mock LLM/media adapter
  interfaces, health endpoint, and focused tests.
