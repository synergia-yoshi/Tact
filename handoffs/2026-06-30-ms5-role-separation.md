# MS5 Role Separation Handoff

Branch: `codex/ms5-role-separation`
Base: `codex/ms4-rich-dashboard` / PR #14
Draft PR: `https://github.com/synergia-yoshi/Tact/pull/15`
Brief: `C:\dev\Obsidian\10_Projects\Tact\2026-06-30-Codex-MS5-role-separation.md`

## Scope

MS5 separates customer and internal roles across backend policy, frontend
navigation, and tests.

Roles:

- `viewer`: read-only customer role.
- `approver`: customer approval role.
- `operator`: internal operation role.
- `admin`: full access.

## Implementation Notes

- Server policy is operation-based in `app/policy.py`.
- API denials return HTTP 403 through the FastAPI policy exception handler.
- Customer role reads are redacted in `CampaignService`.
- Admin-only role management is available through `/api/v1/roles`.
- Role assignment updates write a `role.assignment.updated` audit event.
- Frontend route visibility and action buttons mirror server policy:
  customer roles see only home/dashboard/tasks, operator sees operating
  surfaces, admin sees all screens including roles/settings.

## Validation

- `.\.venv312\Scripts\python.exe -m pytest` passed: 43 tests.
- `.\.venv312\Scripts\python.exe -m ruff check .` passed.
- `npm run test` passed.
- `npm run test:e2e` passed: 4 tests.
- `git diff --check` passed.

## Follow-Up

Next branch should be `codex/responsive-netlify-demo` stacked on this branch.
The next brief should add a static Netlify demo mode with `VITE_DEMO_MODE`,
responsive coverage, demo banner, SPA redirect, and browser-only mock API.
