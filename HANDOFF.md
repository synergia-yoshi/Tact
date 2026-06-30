# Tact Handoff

## 1. Target SSoT

Repo: `synergia-yoshi/Tact`
Local path: `C:\dev\repos\Tact`
Branch: `codex/ms6-production-hardening`
Base: `origin/codex/responsive-netlify-demo` / PR #16
Draft PR: `https://github.com/synergia-yoshi/Tact/pull/17`

This branch starts MS6 production hardening from
`2026-06-30-Codex-MS6-production-hardening.md`. It is intentionally a footing
pass: GCP provisioning is still owner work, while app code, config guards,
tests, and deployment handoff docs are added here.

## 2. What Changed

- Added `AUTH_MODE=oidc` configuration.
- Added a dependency-free RS256/JWKS JWT verifier in `app/oidc.py`.
  It validates `iss`, `aud`, `exp`, `iat`, `nbf`, maximum token age, key
  selection by `kid`, and signature integrity.
- Hardened signed bearer tokens with `iat`, `nbf`, `jti`, `iss`, and `aud`.
- Added optional signed-token replay rejection via `AUTH_REPLAY_PROTECTION`.
- Production is now fail-closed:
  `APP_ENV=production` requires `AUTH_MODE=oidc` plus complete OIDC and IAP
  settings.
- Added IAP assertion verification hook before bearer/OIDC auth.
- Added production security headers: CSP, HSTS, Referrer-Policy,
  X-Content-Type-Options, and X-Frame-Options.
- Added audit payload masking for secret-like keys and email addresses.
- Changed Firestore audit append footing to create-if-absent instead of
  blind `set`, so existing audit entry IDs are not overwritten.
- Normalized legal findings with `category`, `severity`
  (`info`/`warning`/`blocking`), `normalized_term`, and `rationale`.
- Added `deploy/cloud-run-service.yaml` skeleton for Cloud Run behind IAP.
- Added handoff instructions for IAP/Cloud Run and Google Drive plaintext-key
  migration.

## 3. Current State

Working:

- Local/dev compatibility is preserved: `disabled` and `signed_bearer` still
  work outside production.
- Production settings reject `disabled` and `signed_bearer`.
- OIDC verifier attack tests cover expired, future `nbf`, tampering, wrong
  issuer, and wrong audience.
- Signed bearer tests cover future `nbf`, wrong issuer/audience, and duplicate
  `jti` replay rejection.
- Legal blocking/warning results are structured and existing publish flow still
  requires `passed` before approval request.
- Audit payloads redact obvious secrets and emails before persistence.

Still owner/manual:

- Creating the IdP tenant, Cloud Run service, IAP backend, IAM bindings, and
  Secret Manager resources.
- Rotating and removing any plaintext API keys from Google Drive.
- Wiring production structured logs to the target logging backend.

## 4. Validation

- `.\.venv312\Scripts\python.exe -m pytest` passed: 59 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `npm run test` passed:
  TypeScript typecheck and Vitest.
- `npm run test:e2e` passed: 5 Playwright tests.
- `git diff --check` passed.

Known warning: FastAPI/Starlette TestClient emits the existing `httpx2`
deprecation warning only.

## 5. Assumptions Made

- PR split remains:
  - #12: MS2 Vite vertical slice
  - #13: MS2.5-MS3.5 UI/generation experience
  - #14: MS4 rich dashboard
  - #15: MS5 role separation
  - #16: responsive + Netlify static demo
  - #17: MS6 production hardening footing
- Firestore transaction hardening is started with create-if-absent behavior;
  the production SDK transaction decorator should be wired after a real
  Firestore integration pass.
- Signed bearer replay protection is optional so current local/dev multi-request
  UI sessions keep working.

## 6. Next Work

1. Wire real Firestore transaction retries around audit append using the Google
   Cloud client transaction API.
2. Decide staging behavior for `AUTH_REPLAY_PROTECTION`.
3. Add production structured logging sinks for auth failure, 403, Kill,
   approval, role change, and legal blocking events.
4. Provision IdP/IAP/Cloud Run/Secret Manager using
   `deploy/cloud-run-service.yaml` as the skeleton.
