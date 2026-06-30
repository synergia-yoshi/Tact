# MS6 Production Hardening Handoff

Branch: `codex/ms6-production-hardening`
Base: `codex/responsive-netlify-demo` / PR #16
Draft PR: `https://github.com/synergia-yoshi/Tact/pull/17`
Brief: `C:\dev\Obsidian\10_Projects\Tact\2026-06-30-Codex-MS6-production-hardening.md`

## Scope In This Pass

This pass builds the production-hardening footing without provisioning GCP:

- `AUTH_MODE=oidc` configuration and RS256/JWKS verifier.
- Hardened local signed bearer claims: `iat`, `nbf`, `jti`, `iss`, `aud`.
- Optional replay cache for signed bearer tokens.
- Production fail-closed config: production requires `AUTH_MODE=oidc` and IAP
  settings.
- IAP assertion verification hook before bearer auth.
- Production security headers.
- Audit payload masking and Firestore create-if-absent append behavior.
- Legal findings with normalized `category` and `severity`.
- Cloud Run/IAP deployment skeleton.

## Validation

- `.\.venv312\Scripts\python.exe -m pytest`: 59 passed.
- `.\.venv312\Scripts\python.exe -m ruff check .`: passed.
- `npm run test`: passed.
- `npm run test:e2e`: passed, 5 tests.
- `git diff --check`: passed.

## GCP/IAP Setup Notes

Owner action is still required for provisioning.

1. Create an IdP tenant or use the approved identity provider.
2. Set these runtime values:
   - `APP_ENV=production`
   - `AUTH_MODE=oidc`
   - `OIDC_ISSUER`
   - `OIDC_AUDIENCE`
   - `OIDC_JWKS_URL`
   - `IAP_REQUIRED=true`
   - `IAP_ISSUER=https://cloud.google.com/iap`
   - `IAP_AUDIENCE=/projects/<number>/global/backendServices/<id>`
   - `IAP_JWKS_URL=https://www.gstatic.com/iap/verify/public_key-jwk`
3. Deploy Cloud Run without public unauthenticated access.
4. Put IAP or equivalent identity-aware edge auth in front of Cloud Run.
5. Use only Secret Manager refs for sensitive runtime values:
   `sm://projects/<project>/secrets/<name>/versions/latest`.

The skeleton file is `deploy/cloud-run-service.yaml`. Replace placeholder
project, region, service account, image, issuer, audience, and backend service
values before deployment.

## Google Drive Plain-Key Migration

Owner action:

1. Inventory Drive docs/sheets containing API keys, OAuth client secrets, tokens,
   customer email lists, or raw export data.
2. Move every active secret into Google Secret Manager.
3. Rotate any key that was stored in Drive or copied into a chat/doc.
4. Replace Drive references with the Secret Manager resource name only.
5. Delete plaintext copies from Drive trash as well as source docs.
6. Record who rotated each key and when in a private operations log.

Codex should not fetch or move live secrets from Drive.

## Follow-Up

- Replace the Firestore create-if-absent footing with the production SDK
  transaction decorator once connected to the real Firestore client.
- Decide whether replay protection should be enabled for every signed bearer
  request in staging, or only for one-time local/dev tokens.
- Wire structured auth-failure logs to the target logging backend.
