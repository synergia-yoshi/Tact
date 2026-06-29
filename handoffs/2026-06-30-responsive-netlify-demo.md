# Responsive + Netlify Demo Handoff

Branch: `codex/responsive-netlify-demo`
Base: `codex/ms5-role-separation` / PR #15
Draft PR: `https://github.com/synergia-yoshi/Tact/pull/16`
Brief: `C:\dev\Obsidian\10_Projects\Tact\2026-06-30-Codex-responsive-and-netlify.md`

## Scope

This branch adds responsive hardening and a Netlify-friendly frontend-only demo
mode. The normal backend build path is unchanged.

## Implementation Notes

- `app/web/src/api.ts` exports `isDemoMode` and switches to `demoApi` only when
  `VITE_DEMO_MODE` is `1` or `true`.
- `app/web/src/demoApi.ts` mirrors the existing API client shape with browser
  state and simulated responses.
- `app/web/src/main.ts` shows the demo banner and uses test-only labels when
  demo mode is active.
- `netlify.toml` sets `VITE_DEMO_MODE=1`, publishes `app/web/dist`, and adds
  the SPA redirect.
- `package.json` has `build:demo`; Netlify supplies the environment variable.

## Netlify Settings

- Build command: `npm run build:demo`
- Publish directory: `app/web/dist`
- Environment variable: `VITE_DEMO_MODE=1`
- Redirect: `/* -> /index.html` with status `200`

Local demo build:

```powershell
$env:VITE_DEMO_MODE='1'; npm run build:demo; Remove-Item Env:VITE_DEMO_MODE
```

## Validation

- `npm run test`: passed.
- `npm run test:e2e`: passed, 5 tests.
- Demo build with `VITE_DEMO_MODE=1`: passed.
- `.\.venv312\Scripts\python.exe -m pytest`: passed, 43 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .`: passed.
- `git diff --check`: passed.

## Notes

- Demo data is browser memory only.
- The banner intentionally says:
  `デモ環境 ― 実データではありません（テスト用）`.
- Normal builds still call `/api/v1/...`; demo mode is opt-in only.
