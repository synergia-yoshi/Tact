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
- The polished product UI is served by FastAPI as static HTML/CSS/JS from
  `app/web`, using `design-reference.html` as the visual source of truth.

## Local setup

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -e ".[dev]"
cp .env.example .env
python3 -m uvicorn app.main:app --reload
```

## Test

```bash
python3 -m pytest
python3 -m ruff check .
```

## API overview

- `GET /` - serve the Tact UI shell.
- `GET /static/*` - serve UI assets bundled with the FastAPI package.
- `GET /health` - service health and active adapter kinds.
- `POST /api/v1/campaigns/proposals` - create a campaign proposal from a brief.
- `GET /api/v1/campaigns` - list stored campaign proposals.
- `GET /api/v1/campaigns/{campaign_id}` - fetch a campaign proposal.
- `POST /api/v1/campaigns/{campaign_id}/publish` - create a server-side
  `pending_approval` publish action after measurement and legal checks pass; no
  media mutation happens yet.
- `POST /api/v1/campaigns/{campaign_id}/measurements/refresh` - fetch a
  read-only GA4/Shopify-shaped measurement snapshot.
- `GET /api/v1/campaigns/{campaign_id}/measurements/latest` - return the latest
  measurement snapshot for the campaign.
- `POST /api/v1/campaigns/{campaign_id}/legal-checks/run` - run rule-based
  薬機法/景表法 copy checks.
- `GET /api/v1/campaigns/{campaign_id}/legal-checks/latest` - return the latest
  legal check result.
- `POST /api/v1/campaigns/{campaign_id}/kill-switch/evaluate` - evaluate media
  delivery status for emergency-stop decisions.
- `GET /api/v1/campaigns/{campaign_id}/kill-switch/latest` - return the latest
  Kill Switch evaluation.
- `POST /api/v1/campaigns/{campaign_id}/actions/{action_id}/approve` - approve
  and submit a pending publish action to the mock media API.
- `POST /api/v1/campaigns/{campaign_id}/actions/{action_id}/reject` - reject a
  pending publish action without media mutation.
- `GET /api/v1/campaigns/{campaign_id}/performance` - fetch mock media
  performance for a submitted campaign.
- `GET /api/v1/campaigns/{campaign_id}/audit` - list server-generated audit
  entries for one campaign.
- `GET /api/v1/campaigns/audit/verify` - verify the append-only audit hash
  chain.

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
- Milestone 4: server-generated append-only audit ledger with hash-chain
  verification and human approval gating before publish mutation.
- Milestone 5: storage backend switch for Firestore plus Secret Manager
  reference resolution boundaries.
- Milestone 6: measurement-first read model that requires a GA4/Shopify-shaped
  snapshot before publish approval can be requested.
- Milestone 7: rule-based legal-check API that must pass before publish
  approval can be requested.
- Milestone 8: Kill Switch evaluation API that is explicit about simulated
  media status while real media stop APIs are not connected.
- Milestone 9: production auth hardening with token expiry, disabled-auth
  production guard, and a reusable role policy matrix.
- Milestone 10: UI design-system shell based on `design-reference.html`, with
  six navigation screens, responsive layout, and honest pre-API labels.

## Persistence and secrets

Default local storage is in-memory:

```txt
STORAGE_BACKEND=memory
```

Server deployments can switch to Firestore after installing the optional GCP
dependencies:

```bash
python3 -m pip install -e ".[gcp]"
```

```txt
STORAGE_BACKEND=firestore
GCP_PROJECT_ID=<project-id>
FIRESTORE_DATABASE=(default)
FIRESTORE_COLLECTION_PREFIX=tact_mvp_v3
```

Secret values must stay in the runtime environment or Secret Manager. Secret
Manager references use:

```txt
MEDIA_API_KEY=sm://projects/<project-id>/secrets/<secret-name>/versions/latest
```

The health endpoint exposes only adapter/storage kinds, never raw secret values
or secret reference names.

## Auth and tenant boundary

Local development defaults to:

```txt
AUTH_MODE=disabled
```

In that mode the API uses a fixed `dev-org` / `dev-user` context. Server
deployments should require signed bearer auth:

```txt
AUTH_MODE=signed_bearer
AUTH_TOKEN_SECRET=sm://projects/<project-id>/secrets/tact-auth-token-secret/versions/latest
```

Signed bearer tokens carry verified `sub`, `org_id`, and `roles` claims. The
service derives tenant scope from the verified token, requires an `exp` claim,
and ignores spoofable tenant headers such as `x-tact-org`.

`APP_ENV=production` or `APP_ENV=prod` refuses to start with
`AUTH_MODE=disabled`. Local disabled auth maps to an admin-only development
context so the MVP remains easy to exercise without production risk.

Role-gated operations use the shared policy matrix in `app/policy.py`:

- `approver` or `admin`: approve/reject pending publish actions and future
  budget changes.
- `admin`: verify the global audit hash chain, legal overrides, and future real
  Kill Switch stop mutations.
- `operator`, `approver`, or `admin`: evaluate current Kill Switch status.

## Acceptance checklist

- [x] Server-side `.env` loading is supported through `pydantic-settings`.
- [x] `.env` is ignored and only `.env.example` is committed.
- [x] Health and workflow API responses do not expose API keys or base URLs.
- [x] LLM access is behind an adapter with chat-completions style
  request/response models.
- [x] Media access is behind an adapter with plan, publish, and performance
  request/response models.
- [x] Mock adapters are the default and only implemented adapters in this MVP.
- [x] Campaign proposal, publish, and performance flows have API tests.
- [x] Publish requests create `pending_approval` actions before any media
  mutation.
- [x] Audit entries are generated only on the server and verified through a
  hash chain.
- [x] Firestore and Secret Manager are behind server-side adapter boundaries and
  are not required for local tests.
- [x] Campaign and audit access are scoped by verified auth context rather than
  client-supplied tenant headers.
- [x] Publish approval requests require a read-only measurement snapshot first.
- [x] Metric snapshots label values as simulated/measured and carry confidence.
- [x] Publish approval requests require a passed rule-based legal check first.
- [x] Kill Switch evaluation is audited and explicitly marks mock media status
  as simulated.
- [x] Production cannot boot with `AUTH_MODE=disabled`.
- [x] Signed bearer tokens require `exp` and expired tokens are rejected.
- [x] Publish approval and audit verification are role-gated by policy matrix.
- [x] UI shell is served from `/` with six button-based navigation screens.
- [x] `python3 -m pytest` and `python3 -m ruff check .` pass.

## Remaining assumptions

The referenced `Tact_Cursor開発指示書.md` file was not present in the
repository at implementation time. If the file is later added, compare its §7
acceptance criteria against the assumptions above and adjust the API surface or
milestone scope accordingly.
