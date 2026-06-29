# Tact Handoff - Policy Auth Hardening

## 1. Target SSoT

Current SSoT is `synergia-yoshi/cursor` FastAPI MVP, local branch
`codex/policy-auth-hardening` stacked on `codex/kill-switch-status` commit
`d1fa295e1ab59ddbd737a52a5f85d80c836f4448` / PR #9.

## 2. What changed

- Added `app/policy.py` with a reusable policy matrix for execution vs
  recommendation boundaries.
- Added role gates for publish approve/reject, audit verify, Kill Switch
  evaluate, and future budget/legal/live-stop operations.
- Added production settings guard for `AUTH_MODE=disabled`.
- Added signed bearer `exp` generation and verification.
- Updated README and `.env.example`.
- Added focused auth/policy regression tests.

## 3. Current state

- Working:
  - Production settings reject disabled auth.
  - Tokens without `exp` or with expired `exp` are rejected.
  - Operator cannot approve publish; approver can.
  - Operator cannot verify audit; admin can.
  - Local disabled auth still works through a fixed dev admin context.
- Not working yet:
  - Firestore append-only audit transaction enforcement.
  - Strong legal/compliance NLP beyond rule-based matching.
  - Live media stop/pause and budget mutation endpoints.

## 4. Validation

- `.\.venv312\Scripts\python.exe -m pip install -e ".[dev]"` passed.
- `.\.venv312\Scripts\python.exe -m pytest` passed: 33 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `git diff --check` passed.
- Warning observed: FastAPI/Starlette TestClient emits a deprecation warning
  recommending `httpx2`; no test failure.

## 5. Assumptions made

- Local disabled auth maps to admin because production startup now rejects it.
- `approver` is sufficient for publish approval/rejection.
- Global audit verification requires `admin`.
- Token minting is external to this MVP; helper-generated tokens default to a
  one-hour expiry.

## 6. Next work

1. Firestore append-only transaction checks for audit writes.
2. Legal rules review and stronger normalization/severity coverage.
3. Real GA4 + Shopify read adapters and account mapping.
4. Google Ads OAuth and approval-gated budget/publish changes.
5. Live media stop/pause implementation after scopes and approvals are decided.

## 7. Awaiting approval / decisions

- Production token issuer and TTL policy.
- Second-approval threshold for high-budget operations.
- Emergency stop role and two-person approval policy.
- Firestore security rules and deployment IAM boundaries.
