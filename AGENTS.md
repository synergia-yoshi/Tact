# AGENTS.md

## Cursor Cloud specific instructions

### Product overview
Single Python service: **Tact Cursor API**, a FastAPI REST API for a marketing
campaign workflow (create proposal → publish → fetch performance). It has **no
database and no external services** — LLM and media/ads integrations run through
deterministic mock adapters (`MEDIA_ADAPTER`/`LLM_ADAPTER` default to `mock`; the
`real` adapters intentionally raise `NotImplementedError`). Config defaults work
with zero setup; `.env` is optional (see `.env.example`).

### Environment
- Python 3.12. Dependencies are installed into a project virtualenv at `.venv`
  by the startup update script (`pip install -e ".[dev]"`).
- Run tools via the venv directly (no need to activate), e.g. `.venv/bin/pytest`.
- The `python3.12-venv` system package is required to create the venv; it is part
  of the VM snapshot, so the update script does not install it.

### Common commands
- Lint: `.venv/bin/ruff check .`
- Tests: `.venv/bin/pytest` (pytest-asyncio is in `auto` mode; tests live in `tests/`)
- Run dev server: `.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
  - Default uvicorn port is 8000; bind `--host 0.0.0.0` to reach it from outside the VM.
  - Interactive API docs: `/docs`. Health check: `/health`.

### Hello-world smoke test (mock mode, no secrets needed)
```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/campaigns/proposals \
  -H 'Content-Type: application/json' \
  -d '{"name":"Demo","objective":"Drive signups","target_audience":"Tokyo pros","total_budget_jpy":500000,"channels":["instagram","line"],"kpis":["signups"]}'
# then POST /api/v1/campaigns/{id}/publish, then GET /api/v1/campaigns/{id}/performance
```

### Notes
- `*_API_KEY` / `*_BASE_URL` settings are server-only secrets and are deliberately
  never returned by `/health` (enforced by a test); keep it that way.
