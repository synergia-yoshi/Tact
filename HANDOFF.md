# Tact Handoff

## 1. Target SSoT

Repo: `synergia-yoshi/Tact`
Local path: `C:\dev\repos\Tact`
Branch: `codex/responsive-netlify-demo`
Base: `origin/codex/ms5-role-separation` / PR #15
Draft PR: `https://github.com/synergia-yoshi/Tact/pull/16`

This branch implements the responsive + Netlify static demo brief from
`2026-06-30-Codex-responsive-and-netlify.md`. It is stacked on MS5 role
separation and keeps the normal FastAPI-backed build intact.

## 2. What Changed

- Added `VITE_DEMO_MODE` switching in `app/web/src/api.ts`.
  - Normal build: frontend continues to call relative `/api/v1/...`.
  - Demo build: frontend uses an in-browser mock API and does not require the
    FastAPI backend.
- Added `app/web/src/demoApi.ts`, which supports:
  proposal creation, dashboard metrics, legal gate, approval, Kill Switch
  evaluate/stop simulation, integration catalog UI, audit verification, and
  role assignment updates.
- Added `app/web/src/demoApi.test.ts` to verify the browser mock keeps all
  returned dashboard data simulated and customer reads redacted.
- Added a fixed demo banner:
  `デモ環境 ― 実データではありません（テスト用）`.
- Added demo-mode copy guards so source labels and settings text stay test-only
  in demo mode.
- Added `netlify.toml`:
  - build command: `npm run build:demo`
  - publish directory: `app/web/dist`
  - env: `VITE_DEMO_MODE=1`
  - SPA redirect: `/* /index.html 200`
- Strengthened responsive CSS:
  - no document-level horizontal scroll on target widths
  - mobile nav folds into an icon rail with internal scrolling
  - primary tap targets are at least 44px
  - dashboard/settings/cards stack cleanly on narrow widths
- Added Playwright coverage for 360, 390, 768, 1024, 1280, and 1440 widths.
- Rebuilt committed Vite assets in `app/web/dist` with the normal non-demo
  build.

## 3. Current State

Working:

- Normal local/FastAPI mode still uses the backend through relative `/api/v1`
  URLs.
- Netlify/static demo mode can run without backend services.
- Demo mode supports the primary flow:
  create proposal -> dashboard -> approval -> Kill stop simulation ->
  integration catalog -> audit -> role switch.
- Viewer/approver/operator/admin role behavior from MS5 is preserved in demo
  mode.
- Demo API returns simulated/test-use data and redacts customer-role campaign
  reads.
- Demo banner is always visible when `VITE_DEMO_MODE` is enabled.

Still simulated/mock:

- Demo data is in-memory browser state and resets on reload.
- Netlify demo does not connect OAuth, media APIs, GA4, Shopify, or real auth.
- Kill stop remains a simulation and does not perform any real delivery action.

## 4. Netlify Setup

Use the checked-in `netlify.toml`.

- Build command: `npm run build:demo`
- Publish directory: `app/web/dist`
- Environment variable: `VITE_DEMO_MODE=1`
- SPA redirect is already configured:
  `from = "/*"`, `to = "/index.html"`, `status = 200`

Local demo build on PowerShell:

```powershell
$env:VITE_DEMO_MODE='1'; npm run build:demo; Remove-Item Env:VITE_DEMO_MODE
```

Local normal build:

```powershell
npm run build
```

## 5. Validation

- `npm run test` passed:
  TypeScript typecheck and Vitest.
- `npm run test:e2e` passed: 5 Playwright tests.
  Coverage includes the existing role/dashboard flows plus responsive checks for
  360, 390, 768, 1024, 1280, and 1440 widths.
- `VITE_DEMO_MODE=1 npm run build:demo` equivalent passed via PowerShell env.
- `.\.venv312\Scripts\python.exe -m pytest` passed: 43 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `git diff --check` passed.

## 6. Assumptions Made

- PR split remains:
  - #12: MS2 Vite vertical slice
  - #13: MS2.5-MS3.5 UI/generation experience
  - #14: MS4 rich dashboard
  - #15: MS5 role separation
  - #16: responsive + Netlify static demo
- `build:demo` intentionally relies on Netlify or the caller setting
  `VITE_DEMO_MODE=1`; the script itself remains cross-platform.
- `app/web/dist` remains committed because FastAPI serves built assets directly.

## 7. Next Work

1. Deploy the Netlify demo from this branch after PR review.
2. Add persistent demo seeding only if stakeholders need reload-stable state.
3. Keep production auth, OAuth, real media APIs, and real measurement adapters
   on the backend hardening track.
