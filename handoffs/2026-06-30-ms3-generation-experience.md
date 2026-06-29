# Tact Handoff Snapshot: MS3 Generation Experience

## 1. Target SSoT

Repo: `synergia-yoshi/Tact`
Local path: `C:\dev\repos\cursor`
Branch: `codex/ms3-generation-experience`
Base: PR #12 commit `5e901f8` plus MS2.5 polish pass
Draft PR: `https://github.com/synergia-yoshi/Tact/pull/13`

This pass implements the MS3 brief from
`2026-06-30-Codex-MS3-generation-experience.md`. The core rule remains:
do not make the UI look more real than the backend state supports.

## 2. What Changed

- Created the local follow-up branch `codex/ms3-generation-experience` so PR #12
  can remain the MS2 vertical slice.
- Added origin/source fields:
  - `EstimateRange.source`
  - `MediaPlanResponse.source`
  - `CreativeDraft.source`
- UI source labels now render:
  - `mock` as `テスト用の数字` / `テスト用の案`
  - `model` as `自動推定` / `自動作成`
  - `measured` as `実データ`
- Added an SMB-friendly copy pass for the beachhead audience: visible UI avoids
  English/internal terms such as `operator`, `signed_bearer`, `D2C`,
  `BtoB SaaS`, `Feed`, `ROAS`, and `OK` where plain Japanese is clearer.
- Continued the copy pass after in-browser review:
  `配信前チェック` -> `出す前の確認`, `信頼度` -> `確かさ`,
  `獲得単価` -> `1件あたりの費用`, and `テスト表示` -> `テスト用`.
- Reverted the experimental home hero copy after owner feedback; the hero is
  back to `広告づくりを、3問から。出す前の確認まで、ひとつずつ進めます。`.
- Reverted the app chrome visual treatment toward the review's SSoT direction:
  removed `--grad` from the app CSS, replaced purple/blue gradients on primary
  buttons, role switcher, logo/avatar, and mock banner with blue solid or
  neutral/amber surfaces, and removed purple hardcoded shadows.
- Mock creative copy, legal messages, audit summaries, and kill-switch reasons
  now use Japanese user-facing language. Visible channel keys render as
  `検索広告` / `SNS広告` / `バナー広告`, and audit hides raw campaign/org/hash IDs.
- Added a five-step generation stepper:
  1. 宣伝内容の入力
  2. 出し先と予算の案
  3. 広告文の案
  4. 出す前の確認
  5. 最終確認
- Added honest status states: 未着手 / 現在 / 進行中 / 完了 / 失敗.
- Added a progress panel showing only actual events and API-backed
  states. No fake progress bars, fake time estimates, or unexecuted work.
- Gate progress now follows the actual request sequence:
  measurement refresh -> legal check -> pending approval request.
- Added "入力に戻る" and "別案を作る" controls without mutating existing
  server campaign state.
- MS3.5 product refinements implemented from
  `2026-06-30-Codex-MS3.5-product-refinements.md` §1-§4:
  - Budget range now reaches `¥5,000,000` (`min=10 max=500 step=10`).
  - `efficiency` objective label is `費用対効果を最大化`.
  - Automation UI is two choices: `おまかせ` (`approval_only`) and `一緒に`
    (`guided`). `full_auto` remains in the type/API for compatibility but is not
    shown in the UI.
  - The human approval rule for publishing/budget changes is a fixed note
    outside the choices.
  - Settings has honest `データ連携` rows for GA4 / Shopify / Google広告, all
    labeled `テスト用` in local/mock mode, with admin-only connection buttons
    and no API-key input.
  - The Settings data-integration catalog is expanded with `準備中` rows across
    計測・解析 / ネットショップ・決済 / 広告媒体 / 顧客・連絡. The final catalog has
    18 rows: 3 `テスト用` rows and 15 `準備中` rows. Coming-soon rows do not
    expose connection buttons.
- Updated E2E and API tests for source labels and stepper behavior.
- Rebuilt `app/web/dist`.

## 3. Current State

Working:

- Home shows the generation stepper before the form.
- Proposal creation disables the submit button and marks generation as in
  progress while the real request is in flight.
- Creative view shows source-labeled media/creative output and real event
  progress.
- Gate execution advances only through actual API phases.
- Tasks view shows the stepper at pending approval.
- Role-gated approval and dashboard behavior still work.
- Audit verify remains admin-only and formatted.
- App chrome no longer uses the blue-to-purple `--grad`; primary actions,
  logo/avatar, active role controls, and loop badges use SSoT blue tokens.
  The mock creative banner is neutral/amber so test output is not promoted as
  the main brand surface.
- Browser copy check against the local app found no visible English tokens in
  generated creative or audit views except the brand/common `Tact` / `SNS`.
- Home supports creating a proposal at `¥5,000,000`; E2E confirms the submitted
  budget and media-placement sum match.
- Settings shows GA4 / Shopify / Google広告 as `テスト用`, disables connection
  buttons outside admin, and does not display `接続済み` for mock/test rows.
- Settings also lists Search Console, Metaピクセル, BASE, STORES, 楽天市場,
  Amazon, Stripe, Yahoo!広告, Meta広告, X広告, TikTok広告, LINE広告,
  Microsoft広告, LINE公式アカウント, and Mailchimp as `準備中`.

Still mock/simulated:

- Mock LLM creative output.
- Mock media planning/publish.
- Mock GA4/Shopify measurement.
- Settings data integrations are status/UX only; real OAuth and connection
  backend are future work.
- Mock/simulated Kill Switch status.
- Local dev-token issuer.

## 4. Validation

- `npm run test` passed.
- `npm run test:e2e` passed.
  - Includes MS3.5 checks for `¥5,000,000` budget submission/media allocation,
    two-choice automation UI, old copy removal, and data-integration status.
  - Expanded catalog checks 18 integration rows, 15 `準備中` statuses, 3
    connection buttons, and no visible `接続済み` for mock/test rows.
- `npm run build` passed as part of E2E and refreshed `app/web/dist`.
- `.\.venv312\Scripts\python.exe -m pytest` passed: 38 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `git diff --check` passed.
- Post-build headless UI copy smoke passed across home, creative, tasks, and
  dashboard: no visible `配信前チェック` / `信頼度` / `テスト表示` /
  `配信済み` / `獲得単価` regressions.
- Hero revert smoke passed on `http://127.0.0.1:8012/`: original
  `3問で開始` / `広告づくりを、3問から。` hero visible again and the experimental
  `マーケの作業を、AIで下書き。` headline absent.
- MS3.5 browser smoke passed on `http://127.0.0.1:8012/`: home budget attrs,
  two-choice automation UI, old copy absence, settings test statuses,
  admin-only connection path, and 390x844 mobile no-horizontal-overflow check.
- MS3.5 catalog smoke passed via local Playwright: desktop has 4 groups / 18
  rows / `test=3` / `coming_soon=15` / 3 connect buttons / no visible
  `接続済み`; mobile 390x844 has no horizontal overflow.
- Visual SSoT smoke passed:
  - `rg` found no `--grad`, `#5b4ff0`, `#6d5cf5`, `rgba(76, 72, 210, ...)`, or
    `rgba(109, 92, 245, ...)` in `app/web/src/styles.css` or `app/web/dist`.
  - Playwright computed styles confirmed app primary buttons, logo/avatar, and
    active role controls are blue solid with no background image on desktop and
    mobile; allocation bars use the approved blue-only gradient; mock banner is
    amber/neutral.

Known warning: existing FastAPI/Starlette TestClient `httpx2` deprecation
warning only.

## 5. Assumptions Made

- Existing APIs are enough for MS3. Since `createProposal` does not stream
  intermediate events, media plan and creative draft become complete only when
  the proposal response arrives.
- The experimental hero copy was reverted after owner feedback; future
  copy/voice changes should stay proposal-only unless explicitly approved.
- The MS3.5 §5 copy/voice proposal was intentionally not implemented; §1-§4
  were the approved implementation scope.
- Loading phases are acceptable where they map directly to actual sequential API
  calls.
- Retry should not mutate server state; it restores the prior brief into the
  form and lets the user create a separate proposal.
- `app/web/dist` remains committed for immediate FastAPI serving after checkout.

## 6. Next Work

1. Decide exact PR split:
   PR #12 / MS2.5 follow-up / MS3 follow-up.
2. Resolve the remaining process/design question: `design-reference.html`
   contains both an early blue-solid token set and later demo CSS that re-adds
   `--grad`; this pass followed the explicit review direction to use the
   blue-solid SSoT tokens for app chrome.
3. Add Dashboard improvement-loop history, media status, and Kill Switch API
   wiring in MS4.
4. Separate customer-facing read views from operator controls by role.
5. Continue backend hardening separately:
   Firestore append-only transaction, legal dictionary normalization, real
   GA4/Shopify, Google Ads OAuth, scoped real stop/pause.
6. Review MS3.5 §5 copy/voice direction separately before broader copy changes.

## 7. Awaiting Approval / Decisions

- Long-term policy for committing `app/web/dist`.
- Production auth/session design and token issuer.
- Whether/when to introduce React for larger UI state.
- Customer-facing copy and role-separated view boundaries.

## PR Acceptance Checklist

- [x] MS2.5 is carried on a follow-up branch rather than continuing directly on
  PR #12.
- [x] Estimate/media/creative output has source labels.
- [x] Mock outputs are labeled as test-use output; no production/model overclaim
  for mock values.
- [x] Generation is shown as a five-step stepper.
- [x] Step completion is based on server responses or actual API call phases.
- [x] Progress panel contains no fake progress bars or fake timing.
- [x] Visible UI copy is plain Japanese for low marketing/IT literacy SMB users.
- [x] Mock creative/audit/legal/kill-switch explanation text is Japanese.
- [x] Back/retry controls do not mutate existing server campaign state.
- [x] Existing unit/E2E/API tests cover the main path.
- [x] MS3.5 budget upper bound, objective label, two-choice automation UI, and
  Settings data-integration rows are implemented.
- [x] MS3.5 §4-補 expanded integration catalog is implemented with honest
  `準備中` statuses and no false connection path.
- [x] §5 copy/voice proposal was left unimplemented pending approval.
