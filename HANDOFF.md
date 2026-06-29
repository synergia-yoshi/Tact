# Tact Handoff

## 1. Target SSoT

Current SSoT is `synergia-yoshi/cursor` FastAPI MVP + UI shell, local branch
`codex/ui-shell-design-system` stacked on `codex/policy-auth-hardening` commit
`61627b608a264b87bdc1673ac78e44fd9d750af4` / PR #10.

Visual SSoT is `design-reference.html` at the repository root. The reference is
included unchanged for review.

## 2. What changed

- Added a FastAPI-served UI shell at `GET /`.
- Added static UI assets under `app/web`:
  - `app/web/index.html`
  - `app/web/static/styles.css`
  - `app/web/static/app.js`
- Added six button-based sidebar navigation screens:
  - Home
  - Campaigns
  - Tasks / approval queue
  - Creative
  - Audit
  - Settings
- Adopted the reference design tokens:
  - background `#eef2f8`
  - surfaces `#fff` / `#f6f8fc`
  - accent gradient `#2f6bff` -> `#6d5cf5`
  - green/red/amber status colors
  - Inter + Noto Sans JP
  - 14px radius and soft shadow tiers
- Replaced reference-style `<a onclick>` navigation with accessible `<button>`
  controls and `aria-label` support for mobile icon navigation.
- Added honest pre-API labels so polished UI does not imply live backend data:
  - server not connected
  - forecast / simulation
  - approval required
  - mock / no real stop
- Added root/static UI tests and packaged `app/web` into the wheel.
- Updated README.

UI stack choice: FastAPI static HTML/CSS/JS, because the current trusted backend
is Python-only and same-origin static delivery lets the next PR wire the UI to
the existing API without adding a Node build/deploy surface yet.

## 3. Current state

- Working:
  - `/` serves the UI shell.
  - `/static/styles.css` and `/static/app.js` are served.
  - Six navigation screens switch without page reload.
  - Evidence modal opens/closes.
  - Desktop and mobile layouts render without page-level horizontal overflow.
  - Mobile nav keeps accessible names through `aria-label`.
- Screen wiring status:
  - Home: design shell only; not yet posting `CampaignBrief`.
  - Campaigns: honest forecast/simulation placeholder; not yet listing API data.
  - Tasks: approval queue shell; not yet reading pending actions.
  - Creative: design placeholder; not yet using proposal creative/legal output.
  - Audit: hash-chain shell; not yet reading campaign audit or admin verify.
  - Settings: mock connection state; not yet backed by real account mapping.
- Not working yet:
  - No signed bearer token UI storage/minting flow.
  - No proposal API call from the 3-question form.
  - No measurement/legal/pending approval flow in the browser yet.
  - No dashboard MetricSnapshot or Kill Switch API wiring yet.

## 4. Validation

- `.\.venv312\Scripts\python.exe -m pip install -e ".[dev]"` passed.
- `.\.venv312\Scripts\python.exe -m pytest` passed: 36 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `git diff --check` passed.
- Local server smoke on `http://127.0.0.1:8010/` passed:
  - `/` returned 200.
  - `/static/styles.css` returned 200.
  - `/static/app.js` returned 200.
  - `/health` returned 200.
- Browser QA passed:
  - desktop screenshot rendered the shell and home form.
  - mobile viewport `390x844` had 6 nav controls and no page-level horizontal
    overflow.
  - mobile navigation to Audit worked.
  - evidence modal opened and closed.
- Warning observed: FastAPI/Starlette TestClient emits a deprecation warning
  recommending `httpx2`; no test failure.

## 5. Assumptions made

- Milestone 1 should establish the shell/design-system only; API wiring starts
  in Milestone 2.
- Static HTML/CSS/JS is sufficient for this milestone and avoids introducing a
  Node dependency before the UI needs client state orchestration.
- The UI may show carefully labeled placeholders only when they are explicit
  about server connection state, forecast/simulation status, or mock boundaries.
- `design-reference.html` is a review artifact and visual SSoT, so it is
  committed unchanged.

## 6. Next work

1. Wire the home 3-question form to `POST /api/v1/campaigns/proposals`.
2. Add a signed bearer development token flow for operator/approver/admin roles.
3. Render generated creative and media plan from the proposal response.
4. Add evidence modal content from server-derived proposal inputs and adapter
   outputs.
5. Replace placeholder forecasts with labeled ranges and confidence derived from
   server-side simulation/read-model data.

## 7. Awaiting approval / decisions

- Whether to keep static HTML/JS through Milestone 2 or switch to React once
  state orchestration grows.
- The production token issuer and how local reviewers should obtain
  operator/approver/admin tokens.
- Exact copy for customer-facing versus operator-facing role separation.
- Whether `design-reference.html` should remain in the repository permanently
  after implementation catches up.
