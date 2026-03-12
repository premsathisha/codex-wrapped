# Project Overview

AI Wrapped is a local-first Bun web app that scans local AI coding session logs and renders a Wrapped-style dashboard with stats, trends, and breakdowns.

# Must Read

1. Use Bun for all runtime and tooling commands.
2. Keep this app local-first; do not introduce hosted API dependencies for core behavior.
3. Preserve the current frontend visual system and component structure unless a redesign is explicitly requested.
4. Preserve desktop and mobile behavior.
5. Keep `README.md` and `AGENTS.md` aligned with actual scripts and runtime behavior.

# Current Technical Structure

This project is a Bun + Vite + React TypeScript app.

Core entry points:

1. `bin/cli.ts` (CLI launcher)
2. `src/bun/index.ts` (local Bun server)
3. `index.html` + `src/mainview/*` (frontend)
4. `src/shared/*` (shared schemas/types)

# App Structure

## Backend

`src/bun/*` currently includes:

1. Local server routes via `Bun.serve()` in `src/bun/index.ts`.
2. Session discovery and parsing.
3. Aggregation and normalization.
4. Local store read/write for aggregated output.

## Frontend

`src/mainview/*` currently includes:

1. Dashboard pages/cards and chart components.
2. Data hooks and RPC client logic.
3. Styling in `src/mainview/index.css`.

# Stack

1. Bun (runtime, scripts, tests)
2. React + TypeScript (UI)
3. Vite (build/dev tooling)
4. Tailwind CSS (via Vite plugin) plus custom CSS
5. Recharts (dashboard visualizations)

# Key Files

1. `bin/cli.ts`: app CLI (`--help`, `--version`, `--rebuild`, `--uninstall`) and server bootstrap.
2. `bin/launch-macos.sh`: macOS launcher script that starts the local app and opens the local URL.
3. `src/bun/index.ts`: API routes, server startup, and scan orchestration.
4. `src/bun/scan.ts`: discovery + parse + aggregate scan pipeline.
5. `src/shared/schema.ts`: shared source/session/dashboard schemas.
6. `src/mainview/components/Dashboard.tsx`: main dashboard flow.
7. `src/mainview/components/DashboardCharts.tsx`: chart-heavy wrapped cards.
8. `src/mainview/index.css`: global visual and layout rules.

# Runtime Reference

1. Install: `bun install`
2. Run app: `bun ./bin/cli.ts`
3. macOS launcher: double-click `AI Wrapped Launcher.app`
4. Dev mode: `bun run dev`
5. HMR mode: `bun run dev:hmr`
6. Build: `bun run build`
7. Typecheck: `bun run typecheck`
8. Tests: `bun test`
9. Clean: `bun run clean`

## Frontend Build Requirement

1. `bun ./bin/cli.ts` serves static assets from `dist` unless `VITE_DEV_SERVER_URL` is set.
2. After any frontend change (`src/mainview/*`, `index.html`, styles, charts/components), rebuild before validating in the app: `bun run build`.
3. For launcher/normal CLI flows, use `bun ./bin/cli.ts --rebuild` when you need the latest frontend changes included at startup.

Default local URL: `http://127.0.0.1:3210`

# Data and Source Notes

1. Aggregated data is stored locally at `~/.ai-wrapped`.
2. Current enabled source is Codex (`~/.codex`).
3. This repository should continue to operate without requiring cloud-hosted APIs.

# Development Principles

1. Keep behavior deterministic and local-first.
2. Prefer small, targeted changes over broad rewrites.
3. Reuse existing components and utilities where possible.
4. Maintain accessibility and responsive behavior when touching UI.
5. Validate changes with build/tests when practical.

# Commits and Releases

1. Use Conventional Commits.
2. `fix:` triggers patch releases.
3. `feat:` triggers minor releases.
4. `feat!:` or `BREAKING CHANGE:` triggers major releases.
5. `chore:`, `docs:`, `refactor:`, `test:`, `ci:` do not trigger releases.
6. Releases are automated via semantic-release on pushes to `main`.
