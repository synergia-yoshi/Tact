# Tact Handoff - UI Shell Design System

## 1. Target SSoT

Current SSoT is `synergia-yoshi/cursor` FastAPI MVP + UI shell, local branch
`codex/ui-shell-design-system` stacked on `codex/policy-auth-hardening` commit
`61627b608a264b87bdc1673ac78e44fd9d750af4` / PR #10.

Visual SSoT is `design-reference.html` at the repository root. The reference is
included unchanged for review.

## 2. What changed

- Added a FastAPI-served UI shell at `/`.
- Added `app/web/index.html`, `app/web/static/styles.css`, and
  `app/web/static/app.js`.
- Added six accessible button-based navigation screens.
- Adopted the reference tokens, typography, 14px radii, shadows, Japanese copy,
  status badges, cards, modal, and responsive shell.
- Added honest pre-API labels for server-not-connected, forecast/simulation,
  approval-required, mock, and no-real-stop states.
- Added UI shell tests and packaged `app/web` into the wheel.
- Updated README.

UI stack choice: FastAPI static HTML/CSS/JS, because the trusted backend is
Python-only and same-origin static delivery lets the next PR wire the UI to the
existing API without adding a Node build/deploy surface yet.

## 3. Current state

- Working:
  - `/` serves the UI shell.
  - static CSS/JS are served.
  - six nav screens switch without page reload.
  - evidence modal opens/closes.
  - desktop and mobile layouts render without page-level horizontal overflow.
  - mobile nav keeps accessible labels.
- Not wired yet:
  - proposal API form submit.
  - signed bearer role token flow.
  - generated creative/media plan rendering.
  - measurement/legal gate and approval queue API flow.
  - dashboard metrics, audit feed, Kill Switch API.

## 4. Validation

- `.\.venv312\Scripts\python.exe -m pip install -e ".[dev]"` passed.
- `.\.venv312\Scripts\python.exe -m pytest` passed: 36 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `git diff --check` passed.
- Local server smoke on `http://127.0.0.1:8010/` passed for `/`, CSS, JS, and
  `/health`.
- Browser QA passed for desktop render, mobile `390x844`, nav switch to Audit,
  and evidence modal open/close.
- Warning observed: FastAPI/Starlette TestClient emits a deprecation warning
  recommending `httpx2`; no test failure.

## 5. Assumptions made

- Milestone 1 is intentionally shell/design-system only.
- Placeholders are acceptable only when labeled as pre-API, forecast,
  simulation, mock, or approval-required.
- `design-reference.html` should be committed unchanged as the visual SSoT for
  this stack.

## 6. Next work

1. Home 3-question form -> `POST /api/v1/campaigns/proposals`.
2. Local signed bearer token flow for operator/approver/admin.
3. Proposal response -> generated creative and media plan screens.
4. Evidence modals from server-derived proposal inputs.
5. Forecast ranges/confidence from server-side data.

## 7. Awaiting approval / decisions

- Static HTML/JS vs React for later state-heavy milestones.
- Production token issuer and local reviewer token UX.
- Customer-facing vs operator-facing role copy.
- Long-term treatment of `design-reference.html`.
