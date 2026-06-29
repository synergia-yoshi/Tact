# Tact Handoff

## 1. Target SSoT

Repo: `synergia-yoshi/Tact`
Local path: `C:\dev\repos\Tact`
Branch: `codex/ms5-role-separation`
Base: `origin/codex/ms4-rich-dashboard` / PR #14
Draft PR: `https://github.com/synergia-yoshi/Tact/pull/15`

MS5 implements the role-separation brief from
`2026-06-30-Codex-MS5-role-separation.md`. The FastAPI backend is the
authority for permissions; the frontend only mirrors available actions and
navigation.

## 2. What Changed

- Added the `viewer` role beside `operator`, `approver`, and `admin`.
- Expanded `app/policy.py` with explicit read/write operations:
  `campaign.read`, `campaign.create`, `campaign.operate`, `dashboard.read`,
  `audit.read`, and `role.manage`.
- Added a global `PolicyViolationError` handler so denied server actions return
  HTTP 403 instead of depending on hidden UI controls.
- Added role-assignment models and `/api/v1/roles` endpoints. Only admins can
  list or update role assignments, and updates append hash-chain audit events.
- Scoped customer reads for viewer/approver roles:
  internal request/account IDs, targeting, creative specs, action payloads, and
  execution results are redacted from campaign reads.
- Kept operational actions operator/admin only and approval actions
  approver/admin only.
- Updated frontend role switching, navigation, home landing, tasks, dashboard
  controls, audit access, settings access, and a new admin-only role management
  screen.
- Preserved dashboard chart DOM stability while changing roles; unchanged chart
  data is not recreated during role toggles.
- Rebuilt committed Vite assets in `app/web/dist`.

## 3. Current State

Working:

- Viewer: read-only customer surface. Can view dashboard/tasks/home, cannot
  create proposals, run gates, approve, stop, view audit, or manage roles.
- Approver: customer surface with approve/reject and Kill-stop simulation.
  Cannot create/gate, view internal audit, settings, or role management.
- Operator: operational surface with create/gate/dashboard/audit, but cannot
  approve, stop, access settings, or manage roles.
- Admin: full access, including settings, audit verification, and role
  assignment changes.
- API and UI agree on forbidden actions. Tests assert 403s at the API boundary,
  not only hidden buttons.
- Role changes are visible in audit and can be verified through the existing
  audit hash-chain verification endpoint.

Still simulated/mock:

- Role assignment persistence is in-memory for local/dev use.
- Development tokens are still the local role-switching mechanism.
- Measurement, media planning, publish, delivery, and Kill-stop behavior remain
  mock/test implementations from earlier milestones.

## 4. Validation

- `.\.venv312\Scripts\python.exe -m pytest` passed: 43 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `npm run test` passed:
  TypeScript typecheck and Vitest.
- `npm run test:e2e` passed: 4 Playwright tests.
- `git diff --check` passed.

Known warning: FastAPI/Starlette TestClient emits the existing `httpx2`
deprecation warning only.

## 5. Assumptions Made

- PR split remains:
  - #12: MS2 Vite vertical slice
  - #13: MS2.5-MS3.5 UI/generation experience
  - #14: MS4 rich dashboard
  - #15: MS5 role separation
- MS5 stacks on PR #14 via branch `codex/ms5-role-separation`.
- In-memory role assignment is acceptable for MS5 because the brief allows a
  mock/dev-token expression.
- `app/web/dist` remains committed because FastAPI serves built assets directly.

## 6. Next Work

1. Implement the responsive + Netlify demo brief on a new branch stacked on
   `codex/ms5-role-separation`.
2. Add a browser-only demo API behind `VITE_DEMO_MODE` so Netlify can serve a
   static demo without the FastAPI backend.
3. Add a persistent role store when production identity/session design is ready.
4. Continue backend hardening separately: Firestore append-only transactions,
   real GA4/Shopify adapters, Google Ads OAuth, and production auth issuer.

## 7. Awaiting Approval / Decisions

- Confirm whether MS5 role assignment should remain dev-only until production
  identity work begins.
