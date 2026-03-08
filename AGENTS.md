# AGENTS.md

This repository has three working areas:
- `frontend/`: React 18 + TypeScript + Vite + Arco Design admin and public UI.
- `backend/`: Rust 2024 + Axum + SQLx + MySQL + Redis HTTP API.
- `csgo-plugin/`: SourceMod / SourcePawn plugin source plus compiled artifact.
## Rule Sources
- No Cursor or Copilot rule files were found: `.cursor/rules/`, `.cursorrules`, `.github/copilot-instructions.md`.
- Follow the existing code and the conventions in this file.
## Working Assumptions
- Use `pnpm` for JavaScript package management and run commands from the repository root unless a section says otherwise.
- Prefer targeted validation for the area you changed.
- Avoid adding new tools, frameworks, or config files unless the task needs them.
- Keep generated or compiled artifacts in sync only when that area of the repo already tracks them.
- Backend defaults point at a real MySQL/Redis host, so local runs can have real side effects.
- Never commit real secrets such as `STEAM_WEB_API_KEY`, DB passwords, or live `.env` values.
## Repository Layout
- `frontend/src/pages/`: top-level screens.
- `frontend/src/layouts/`: public vs protected shells.
- `frontend/src/contexts/AppStoreContext.tsx`: central frontend state and mutation layer.
- `frontend/src/api/` and `frontend/src/types/index.ts`: API adapter layer, contracts, and shared frontend models.
- `frontend/src/router/index.tsx`: route tree and auth split.
- `backend/src/http/`: Axum routes, handlers, request structs, API envelopes.
- `backend/src/application/`: business logic.
- `backend/src/domain/` and `backend/src/infra/`: DB rows, API/domain models, and schema/bootstrap code.
- `backend/src/support/`: validation, Steam helpers, time conversion, RCON, shell execution.
- `csgo-plugin/kzguard_presence.sp`: SourcePawn source of truth.
- `csgo-plugin/kzguard_presence.smx`: compiled plugin currently checked into the repo.
## Install And Setup
- Install JS dependencies with `pnpm install`.
- Env templates: `frontend/.env.example` and `backend/.env.example`.
- Override DB, Redis, and Steam-related env vars before running locally if needed.
- The frontend currently uses the HTTP adapter directly; there is no active mock mode.
## Development And Build Commands
- Frontend dev server: `pnpm dev`.
- Explicit frontend dev server: `pnpm dev:frontend`.
- Backend dev server from root: `pnpm dev:backend`.
- Backend dev run directly: `cargo run --manifest-path backend/Cargo.toml`.
- Frontend preview build: `pnpm preview`.
- Full repo build: `pnpm build`.
- Frontend build only: `pnpm --filter frontend build`.
- Backend build only: `cargo build --manifest-path backend/Cargo.toml`.
- Backend release run: `cargo run --manifest-path backend/Cargo.toml --release`.
- Backend fast compile check: `cargo check --manifest-path backend/Cargo.toml`.
- SourceMod compile: `csgo-plugin/sourcemod-1.11.0-git6970-linux/addons/sourcemod/scripting/spcomp csgo-plugin/kzguard_presence.sp -i csgo-plugin/sourcemod-1.11.0-git6970-linux/addons/sourcemod/scripting/include -o csgo-plugin/kzguard_presence.smx`
## Lint, Format, And Static Checks
- Frontend has no ESLint or Prettier config in this repo.
- Frontend type check: `pnpm --filter frontend exec tsc --noEmit`.
- Frontend build already runs `tsc` before Vite bundling.
- Rust format check: `cargo fmt --manifest-path backend/Cargo.toml -- --check`.
- Rust format write: `cargo fmt --manifest-path backend/Cargo.toml`.
- Rust lint: `cargo clippy --manifest-path backend/Cargo.toml`.
- Strict Rust lint: `cargo clippy --manifest-path backend/Cargo.toml -- -D warnings`.
- Current repo state: `cargo fmt --check` is not clean, and strict Clippy fails on existing `too_many_arguments` and `collapsible_if` warnings.
## Test Commands
- Backend tests: `cargo test --manifest-path backend/Cargo.toml`.
- List backend tests: `cargo test --manifest-path backend/Cargo.toml -- --list`.
- Run one backend test by substring: `cargo test --manifest-path backend/Cargo.toml my_test_name`.
- Run one backend test exactly: `cargo test --manifest-path backend/Cargo.toml my_test_name -- --exact --nocapture`.
- Run one backend test module or prefix: `cargo test --manifest-path backend/Cargo.toml whitelist::`.
- Current state: `cargo test -- --list` reports `0` Rust tests.
- Frontend has no test runner, and the SourceMod plugin has no automated test harness in this repo.
- If you add tests, document the new command in `package.json` or this file.
## Recommended Validation
- Frontend-only change: `pnpm --filter frontend exec tsc --noEmit && pnpm --filter frontend build`.
- Backend-only change: `cargo check --manifest-path backend/Cargo.toml && cargo test --manifest-path backend/Cargo.toml`.
- Full-stack API contract change: `pnpm build && cargo test --manifest-path backend/Cargo.toml`.
- Plugin change: recompile `csgo-plugin/kzguard_presence.sp` and describe any manual server verification still needed.
- If validation fails because of known pre-existing issues, say so explicitly in your handoff.
## General Style Rules
- Match existing patterns before inventing a new abstraction.
- Keep edits focused; do not mass-reformat unrelated files.
- Keep user-facing copy in Chinese unless a protocol, command, or product name must stay in English.
- Prefer small helpers over duplicated normalization or validation logic.
- Preserve existing response shapes, route structure, and domain terminology.
## TypeScript And React Style
- TypeScript is `strict`; do not introduce `any`.
- Prefer explicit interfaces and type aliases, especially in `frontend/src/types/index.ts`.
- Use `import type` for type-only imports.
- Keep external imports first, then a blank line, then local imports.
- Use relative imports only; no path alias config exists.
- Prefer named exports for pages, layouts, hooks, and utilities.
- Existing TS style uses 2-space indentation, semicolons, single quotes, and trailing commas.
- Prefer arrow functions for components and utilities.
- Use `unknown` in `catch` blocks and convert with helpers such as `getErrorMessage`.
- When intentionally ignoring a promise in an event callback, use `void handler()`.
- Use `satisfies` for config objects when it improves type safety.
- Normalize text input with `trim()` or helper functions before API calls.
- Keep raw `fetch` calls inside `frontend/src/api/`; UI code should go through `requestJson`, `apiService`, or context methods.
- Keep public and protected routes separated in `frontend/src/router/index.tsx`.
- Shared app mutations currently live in `AppStoreContext`; only split that layer when clearly justified.
- Use Arco `Message` for transient feedback and `Alert` for persistent notices.
## Frontend Naming And Data Rules
- Components, pages, and layouts use PascalCase names like `LoginPage` and `AppLayout`.
- Hooks use the `useX` naming pattern like `useAppStore`.
- Local variables and functions use camelCase.
- Shared type names use PascalCase, for example `WebsiteAdminRole`.
- Frontend wire-format fields are camelCase.
- `frontend/src/api/index.ts` exports `httpApi` directly, and `frontend/src/api/config.ts` hardcodes `mode: 'http'`; do not assume runtime adapter switching exists.
- Keep new shared API fields synchronized with `frontend/src/types/index.ts` and `frontend/src/api/contracts.ts`.
## Rust Style
- New or edited Rust should remain `rustfmt`-compatible even though the full backend is not fmt-clean today.
- Use 4-space indentation and accept rustfmt line wrapping.
- Prefer grouped imports like `use crate::{...};` when that keeps modules readable.
- Keep long import lists and chained builder calls multiline with trailing commas.
- Use snake_case for functions, modules, and fields.
- Use PascalCase for structs and enums.
- Use `Db` prefixes for raw database row types in `backend/src/domain/db.rs`.
- Keep request structs in `backend/src/http/requests.rs`.
- Keep response/domain structs in `backend/src/domain/models.rs`.
- Use `Option<T>` for nullable backend values.
- Keep serialized transport structs on camelCase with `#[serde(rename_all = "camelCase")]` unless the protocol requires otherwise.
- DB row structs should stay snake_case to match SQL columns.
- Prefer inline SQL with `sqlx::query` or `sqlx::query_as` and bound parameters, not value interpolation.
- Use raw string SQL for multiline queries.
- Keep handlers thin and put business rules in `backend/src/application/`.
- Reuse validation helpers in `backend/src/support/validation.rs` or nearby application helpers.
- API timestamps are ISO strings; conversions live in `backend/src/support/time.rs`.
## Backend Error Handling And API Rules
- Return `AppResult<T>` from backend application and handler code.
- Use `AppError::http(StatusCode::..., "...")` for user-facing HTTP errors.
- Add `anyhow::Context` when startup or infrastructure failures need more detail.
- Convert lower-level helper failures into friendly API messages with `map_err`.
- Success payloads usually return `Json<ApiEnvelope<T>>`.
- Message-only actions use `MessageResponse`.
- Preserve the existing `{ data, message? }` API envelope shape.
- Mutation paths often append operation logs; keep that behavior consistent.
## API Contract Coordination
- Frontend expects camelCase JSON keys.
- Backend request structs often deserialize camelCase into snake_case fields via Serde attributes.
- If you add, remove, or rename backend fields, update matching TS interfaces and API adapter calls in the same change.
- Keep plugin-facing internal endpoints stable unless the task explicitly requires a protocol change.
- Preserve `X-Plugin-Token` for plugin authentication.
- Preserve the existing public/internal route layout unless there is a clear migration plan.
## Database, Cache, And Infra Notes
- There is no `backend/migrations/` directory; schema bootstrap and incremental `ALTER TABLE` logic currently live in `backend/src/infra/mysql.rs`.
- If you change schema assumptions, update that bootstrap logic and verify backend startup.
- Redis stores player presence and server access snapshots; coordinate key or payload changes with the plugin.
- Be careful with code that hits real MySQL, Redis, RCON, or Steam APIs because repo defaults are not purely local.
- `STEAM_WEB_API_KEY` must come from environment or deployment secrets, never hardcode it.
## SourcePawn Plugin Style
- Keep `#pragma semicolon 1` and `#pragma newdecls required` at the top of plugin files.
- SourcePawn code uses tabs and brace-on-next-line formatting.
- Global plugin state uses the `g_` prefix.
- Command and callback functions follow SourceMod naming like `Command_AdminBan` and `OnPluginStart`.
- Preserve compatibility with both `api_base_url` and the older per-endpoint config keys in `kzguard.cfg`.
- `kzguard_presence.sp` is the editable source of truth; rebuild `kzguard_presence.smx` after plugin source changes.
## What To Avoid
- Do not add frontend path aliases without updating both Vite and TypeScript config.
- Do not switch TS quote style, semicolon style, or export style across files.
- Do not assume strict Clippy is green today.
- Do not hardcode secrets or production-only endpoints.
- Do not change wire-format casing casually.
- Do not mass-reformat unrelated Rust files just because rustfmt wants to.
## Before Finishing
- Re-run the smallest relevant validation commands for the area you changed.
- Mention any skipped checks and why they were skipped.
- Call out pre-existing failures separately from new failures.
- If you changed backend models, frontend types, and plugin payloads together, mention the contract change explicitly.
- If you add new commands or workflows, update this file in the same change.
