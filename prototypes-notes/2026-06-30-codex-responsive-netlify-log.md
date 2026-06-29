# Codex Responsive + Netlify Demo Log

Date: 2026-06-30
Repo: `C:\dev\repos\Tact`
Branch: `codex/responsive-netlify-demo`

## Completed

- Added browser-only demo API behind `VITE_DEMO_MODE`.
- Added Netlify config with static publish, demo env, and SPA redirect.
- Added demo banner and demo-mode copy guards.
- Added responsive hardening for narrow nav, dashboard, settings, and tap
  targets.
- Added unit coverage for the demo API and E2E coverage for 360/390/768/1024/
  1280/1440 widths.

## Validation So Far

- `npm run test`: passed.
- `npm run test:e2e`: passed.
- PowerShell `VITE_DEMO_MODE=1` demo build: passed.
- Python pytest: passed, 43 tests.
- Ruff: passed.
- `git diff --check`: passed.

## Notes

- Normal build behavior remains backend-backed through relative `/api/v1`.
- Committed dist is generated from normal build; Netlify regenerates demo dist
  during deploy.
