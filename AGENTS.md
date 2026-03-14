# Repository Guidelines

## Project Overview
Codex Wrapped is a local-first Bun web app that scans local AI coding session logs and renders a Wrapped-style dashboard with stats, trends, and breakdowns.

## Non-Negotiables
1. Use Bun for all runtime, scripts, tests, and tooling commands.
2. Keep the app local-first; do not add hosted API dependencies for core behavior.
3. Preserve desktop and mobile behavior.
4. Preserve the current frontend visual system/component structure unless a redesign is explicitly requested.
5. Keep `README.md` and `AGENTS.md` aligned with actual scripts and runtime behavior.

## Project Structure
- `bin/cli.ts`: CLI launcher (`--help`, `--version`, `--rebuild`, `--uninstall`) and server bootstrap.
- `bin/launch-macos.sh`: macOS launcher that starts the local app and opens the local URL.
- `src/bun/*`: Bun server routes, session discovery/parsing, aggregation, local store persistence.
- `src/mainview/*`: React UI (dashboard/cards/charts/hooks/styles).
- `src/mainview/components/DownloadableCard.tsx`: shared card wrapper for saving/sharing wrapped cards as PNG.
- `src/shared/*`: shared schemas/types used by backend and frontend.
- `index.html`: Vite entry HTML for the frontend bundle.

## Build, Test, Run
- Install dependencies: `bun install`
- Run app (normal flow): `bun ./bin/cli.ts`
- Run app with fresh frontend at startup: `bun ./bin/cli.ts --rebuild`
- Dev mode: `bun run dev`
- HMR mode: `bun run dev:hmr`
- Build frontend bundle: `bun run build`
- Typecheck: `bun run typecheck`
- Tests: `bun test`
- Clean artifacts: `bun run clean`
- Default local URL: `http://127.0.0.1:3210`

## Frontend Build & Validation Rules
1. `bun ./bin/cli.ts` serves static assets from `dist` unless `VITE_DEV_SERVER_URL` is set.
2. After any frontend change (`src/mainview/*`, `index.html`, shared styling), always run `bun run build` before validating in the app.
3. For launcher/normal CLI validation, prefer `bun ./bin/cli.ts --rebuild` so the running app cannot use stale assets.
4. If a server is already running on `127.0.0.1:3210`, restart it before validating changes.
5. For user-facing fixes, validate against the live local endpoint, not only tests.

## Data & Runtime Notes
1. Aggregated app data is stored locally in `~/.codex-wrapped`.
2. Current enabled source is Codex (`~/.codex`).
3. Scans and summaries must remain deterministic and local-only.
4. Never mutate or delete source session logs in `~/.codex` as part of normal feature/fix work.

## Coding Principles
1. Prefer small, targeted changes over broad rewrites.
2. Reuse existing utilities/components before adding new abstractions.
3. Preserve accessibility and responsive behavior when touching UI.
4. Treat usage/pricing/date logic as data-integrity-sensitive code; add/adjust tests for regressions.
5. Keep naming and file organization consistent with existing patterns.

## Testing Expectations
1. Run `bun run typecheck` and relevant tests after code edits; run full `bun test` for cross-cutting changes.
2. For parsing/pricing/aggregation changes, include or update focused tests in `src/bun/*`.
3. For frontend formatting/visual logic changes, include or update tests in `src/mainview/*` where practical.
4. If you cannot run a required check, explicitly call it out in handoff.

## Commit & Release Notes
1. Use Conventional Commits.
2. `fix:` triggers patch releases.
3. `feat:` triggers minor releases.
4. `feat!:` or `BREAKING CHANGE:` triggers major releases.
5. `chore:`, `docs:`, `refactor:`, `test:`, `ci:` do not trigger releases.
6. Releases are automated via semantic-release on pushes to `main`.

## Agent Workflow Notes
1. Do not validate frontend fixes against stale bundles.
2. After any frontend tweak, rebuild `dist` (`bun run build`) before checking the UI.
3. After edits affecting runtime behavior, verify with live local API/UI where possible.
4. If scan/persistence logic changes, sanity-check `scan` completion and dashboard totals from local endpoints.
5. Prefer non-destructive operations; do not remove user data or rewrite source logs unless explicitly requested.
6. For card export changes, validate save/share behavior from the card download button against the live local UI.
