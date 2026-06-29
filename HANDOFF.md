# Tact Handoff

## 1. Target SSoT

Current implementation target is `synergia-yoshi/Tact`. Local repo path remains
`C:\dev\repos\cursor` because the old repo name redirects.

Current local branch is `codex/ms3-generation-experience`, created as a
follow-up branch on top of PR #12 commit `5e901f8` plus the MS2.5 polish pass.
PR #12 itself should remain the MS2 Vite vertical slice; MS2.5/MS3 should be
reviewed as follow-up PRs.

Draft PR for this follow-up work:
`https://github.com/synergia-yoshi/Tact/pull/13`

Visual SSoT is `design-reference.html` at the repository root. It remains
read-only reference material.

Runtime SSoT remains the FastAPI backend. The UI does not invent authoritative
campaign state, forecast ranges, confidence, approval state, audit status, or
generation completion. It calls reviewed API endpoints and renders server
responses or explicit in-flight API phases.

## 2. What Changed

- Preserved the Vite + TypeScript seven-nav UI from PR #12 and the MS2.5 polish
  pass.
- Added `source` to `EstimateRange`, `MediaPlanResponse`, and `CreativeDraft`.
- UI labels now distinguish mock/model/measured origins:
  - `mock` -> `テスト用の数字` or `テスト用の案`
  - `model` -> `自動推定` or `自動作成`
  - `measured` -> `実データ`
- Replaced remaining over-strong generation labels so mock creative/media output
  is not presented as production server/model output.
- Added an SMB-friendly copy pass for low marketing/IT literacy users:
  visible UI now avoids English/internal terms such as `operator`,
  `signed_bearer`, `D2C`, `BtoB SaaS`, `Feed`, `ROAS`, and `OK` where a plain
  Japanese label is clearer.
- Continued the copy pass after in-browser review:
  `配信前チェック` -> `出す前の確認`, `信頼度` -> `確かさ`,
  `獲得単価` -> `1件あたりの費用`, and `テスト表示` -> `テスト用`.
- Reverted the experimental home hero copy after owner feedback; the hero is
  back to `広告づくりを、3問から。出す前の確認まで、ひとつずつ進めます。`.
- Reverted the app chrome visual treatment toward the review's SSoT direction:
  removed `--grad` from the app CSS, replaced purple/blue gradients on primary
  buttons, role switcher, logo/avatar, and mock banner with blue solid or
  neutral/amber surfaces, and removed purple hardcoded shadows.
- Local mock creative output is now Japanese, visible channel keys render as
  `検索広告` / `SNS広告` / `バナー広告`, and audit UI hides raw campaign/org/hash
  IDs behind plain operation summaries.
- Added a generation stepper:
  1. 宣伝内容の入力
  2. 出し先と予算の案
  3. 広告文の案
  4. 出す前の確認
  5. 最終確認
- Step statuses are derived from server responses, current API calls, or the
  last failed operation: 未着手 / 現在 / 進行中 / 完了 / 失敗.
- Added an honest progress panel in Creative. It shows only real events:
  proposal API response, media adapter response, LLM adapter response,
  measurement refresh, legal check, and publish approval request.
- Gate execution now updates loading phases for the actual API sequence:
  measurement -> legal -> publish request.
- Added "入力に戻る" and "別案を作る" controls. They do not mutate server
  state; retry only restores the prior brief into the form so a new proposal can
  be requested.
- MS3.5 product refinements implemented:
  - Monthly budget slider now supports `¥100,000` to `¥5,000,000` in
    `¥100,000` steps while preserving `total_budget_jpy = value * 10000`.
  - The `efficiency` objective label is now `費用対効果を最大化`; the backend key
    remains `efficiency`.
  - Automation choice UI is now two options: `おまかせ` (`approval_only`) and
    `一緒に` (`guided`). Legacy `full_auto` can still exist in the enum/API but
    is not exposed in the UI; retrying an old `full_auto` campaign falls back to
    `approval_only`.
  - The rule `広告を出す前・予算変更は必ず人が確認` is shown as a fixed policy note,
    not as one selectable mode.
  - Settings now includes a `データ連携` section for GA4, Shopify, and Google広告.
    Current dev/mock rows are labeled `テスト用`, connection buttons are
    admin-only, and no API key input/storage/display was added.
- Rebuilt committed FastAPI-served assets in `app/web/dist`.
- Existing MS2.5 behavior remains:
  loading/disabled/double-submit guards, partial rendering, stable Chart.js,
  no fabricated trend line, formatted audit verify, local-only role switcher,
  assertive toast, and modal focus restore.

## 3. Current State

- Working:
  - `/` serves `app/web/dist/index.html`.
  - `/static/main.js` and `/static/index.css` serve built Vite assets.
  - Proposal creation displays a stepper and shows real in-flight API state.
  - Creative/media plan output carries explicit test-use source labels.
  - Publish gate progress is tied to actual API calls, not fake progress bars or
    timers.
  - Pending approval is still server-created and role-gated.
  - Operator can create proposals and request publish approval.
  - Operator cannot approve publish; approver/admin can.
  - Dashboard shows only current metric data, with `実データ` / `テスト用` labels and
    no implied improvement history.
  - Audit view reads campaign audit entries; verify remains admin-only and is
    rendered as formatted continuity status.
  - App chrome no longer uses the blue-to-purple `--grad`; primary actions,
    logo/avatar, active role controls, and loop badges use SSoT blue tokens.
    The mock creative banner is neutral/amber so test output is not promoted as
    the main brand surface.
  - 401/403/404/409 are translated into Japanese UI messages.
  - Browser copy check on `http://127.0.0.1:8012/` found no visible English
    tokens in generated creative or audit views except the brand/common `Tact`
    / `SNS`.
  - Budget creation at `¥5,000,000` is covered by E2E and media placement
    budget allocation sums exactly to the submitted total.
  - Settings shows GA4 / Shopify / Google広告 as `テスト用`; non-admin connection
    buttons are disabled, admin sees the connection path, and the UI does not
    display `接続済み` for mock/test integrations.
- Still mock/simulated:
  - GA4/Shopify read model is the existing mock adapter.
  - The new Settings data-integration rows are status/UX only; real OAuth and
    backend connection state are future work.
  - LLM creative output is the mock LLM adapter.
  - Media planning/publish is mock media.
  - Kill Switch text states simulation/no real stop.
  - Role token minting is local-only and not a production issuer.
- Not yet complete:
  - Rich Dashboard with improvement-loop history, media delivery status, and
    Kill Switch API wiring is still MS4.
  - Customer/operator screen separation remains a later milestone.
  - Real GA4/Shopify, Google Ads OAuth, Firestore transaction immutability, and
    legal dictionary hardening remain separate backend work.

## 4. Validation

- `npm run test` passed:
  - TypeScript typecheck
  - Vitest XSS escaping unit test
- `npm run test:e2e` passed:
  - proposal -> stepper/source labels -> gate -> pending approval -> operator
    denied -> approver approval -> dashboard
  - chart canvas remains stable across role switching
  - audit verify is admin-only and formatted
  - proposal submit is disabled while the request is in flight
  - MS3.5 budget upper bound, two automation choices, old copy removal, and
    settings data-integration state are covered
- `npm run build` passed as part of `npm run test:e2e` and refreshed
  `app/web/dist`.
- `.\.venv312\Scripts\python.exe -m pytest` passed: 38 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `git diff --check` passed.
- Post-build headless UI copy smoke passed across home, creative, tasks, and
  dashboard: no visible `配信前チェック` / `信頼度` / `テスト表示` /
  `配信済み` / `獲得単価` regressions.
- Hero revert smoke passed on `http://127.0.0.1:8012/`: original
  `3問で開始` / `広告づくりを、3問から。` hero visible again and the experimental
  `マーケの作業を、AIで下書き。` headline absent.
- MS3.5 browser smoke passed on `http://127.0.0.1:8012/`:
  home budget attributes are `min=10 max=500 step=10`, old goal/automation copy
  is absent, settings integration rows are `テスト用`, admin-only connection path
  shows a server-side OAuth/API-key warning, and a 390x844 mobile viewport has
  no horizontal overflow on the changed home/settings areas.
- Visual SSoT smoke passed:
  - `rg` found no `--grad`, `#5b4ff0`, `#6d5cf5`, `rgba(76, 72, 210, ...)`, or
    `rgba(109, 92, 245, ...)` in `app/web/src/styles.css` or `app/web/dist`.
  - Playwright computed styles confirmed app primary buttons, logo/avatar, and
    active role controls are blue solid with no background image on desktop and
    mobile; allocation bars use the approved blue-only gradient; mock banner is
    amber/neutral.
- Known warning: FastAPI/Starlette TestClient emits the existing `httpx2`
  deprecation warning; no failure.

## 5. Assumptions Made

- PR #13 is the active draft follow-up PR for this branch.
- The experimental hero copy was reverted after owner feedback; future
  copy/voice changes should stay proposal-only unless explicitly approved.
- The MS3.5 §5 copy/voice proposal was intentionally not implemented; only
  §1-§4 were treated as approved implementation work.
- Existing APIs are enough for MS3's honest generation experience. Because
  `createProposal` does not stream intermediate events, media plan and creative
  draft are marked complete only when the server response arrives.
- Loading phase changes during gate execution are acceptable because they are
  tied one-to-one to actual API calls.
- Test-use source labels are mandatory while the adapters remain mock-backed.
- Committing `app/web/dist` remains acceptable because FastAPI serves built
  static assets directly.

## 6. Next Work

1. Decide how to split PRs:
   - PR #12: MS2 Vite vertical slice
   - follow-up: MS2.5 polish
   - follow-up: MS3 generation experience
2. Resolve the remaining process/design question: `design-reference.html`
   contains both an early blue-solid token set and later demo CSS that re-adds
   `--grad`; this pass followed the explicit review direction to use the
   blue-solid SSoT tokens for app chrome.
3. Expand Dashboard with improvement-loop history, media delivery status, and
   Kill Switch API wiring while keeping mock status explicit.
4. Split customer-facing read views from operator controls by role.
5. Continue backend hardening separately:
   Firestore append-only transactions, legal normalization/severity review,
   real GA4/Shopify read adapters, Google Ads OAuth, and scoped real stop/pause.
6. Review the MS3.5 §5 copy/voice proposal separately before any broader copy
   rewrite.

## 7. Awaiting Approval / Decisions

- Whether built `app/web/dist` should stay committed long-term or be produced by
  CI before Python packaging/deploy.
- Whether PR #13 should stay stacked on PR #12 until PR #12 lands, or be retargeted
  after the base branch is merged.
- Production auth/token issuer and session UX.
- Whether to introduce React before the UI grows beyond the lightweight
  TypeScript store/router layer.
- Customer-facing copy for role-separated screens.
