# Codex Wrapped

Codex Wrapped is a local dashboard that summarizes your Codex activity in a Spotify Wrapped–style dashboard. This project is built on top of [gulivan/ai-wrapped](https://github.com/gulivan/ai-wrapped) with a few improvements. Codex card inspiration from [JeanMeijer/slopmeter](https://github.com/JeanMeijer/slopmeter).

## Screenshot

![Codex Wrapped dashboard screenshot](assets/screenshot.png)

## Who This Is For

Codex Wrapped is for developers who use Codex through an OpenAI subscription and want a clear, visual summary of how they code over time. It also helps estimate what that usage would cost if billed through the API.

## Key Features

- Theme switching with multiple palette options
- Date range selection (Last 7/30/90/365 days and yearly views)
- Wrapped-style cards and charts for sessions, tokens, cost, models, repos, and coding hours
- Save each card as PNG directly to your device
- Import/export full-history CSV backups for moving between computers, with popup import feedback that surfaces backend rejection reasons

## Improvements in This Fork

- Visual redesign and UI polish across the dashboard
- Theme switching with multiple palette options
- Ability to save individual cards as PNG images
- Shift from the original app + multi-agent scope to a local website focused specifically on Codex-only support
- Improved pricing accuracy and handling of edge-case scenarios in cost calculations

## Quick Start

```bash
bun install
bun run build
bun ./bin/cli.ts
```

## Run The App

1. On macOS, preferred launcher: double-click `Open Codex Wrapped.command` in the repo root to start the local server and open the app URL.

2. Or start manually from Terminal:
   - Run: `bun ./bin/cli.ts`

   - Then open: `http://127.0.0.1:3210`

## Prerequisites

- Bun (latest stable)
- macOS, Linux, or Windows
- Local Codex history files in your home directory (`~/.codex`)

## Development

Run backend + built frontend:

```bash
bun run dev
```

Run frontend HMR + backend together:

```bash
bun run dev:hmr
```

Typecheck:

```bash
bun run typecheck
```

Lint:

```bash
bun run lint
```

Format check:

```bash
bun run format:check
```

Format (write):

```bash
bun run format
```

Run tests:

```bash
bun test
```

Set up repo-managed git hooks (pre-commit + pre-push):

```bash
bun run prepare
```

Git hook behavior:

- `pre-commit`: runs `typecheck`, lint + format checks on staged files, and focused tests mapped from changed files.
- `pre-push`: runs `typecheck`, lint + format checks on files changed since upstream, and full test suite.

Clean build artifacts:

```bash
bun run clean
```

## CLI Options

These flags control local runtime behavior only (not provider selection).

```bash
bun ./bin/cli.ts --help
```

- `--version` or `-v`: show app version
- `--rebuild`: rebuild frontend assets before launch
- `--uninstall`: remove local Codex Wrapped data at `~/.codex-wrapped`

## How It Works

1. **Local session discovery**: the scanner reads Codex session logs from both `~/.codex/sessions` and `~/.codex/archived_sessions` (or equivalent paths under `CODEX_HOME`, or a configured custom Codex path). By default, background scans run every 5 minutes.
2. **Parsing + normalization**: each session file is parsed into a consistent internal schema (events, tokens, costs, tools, model, timestamps, repo context).
3. **Canonical history**: normalized sessions are aggregated into UTC hourly facts for durable local history storage.
4. **Import/export**: Codex Wrapped can export the full known history chain to CSV and import it later on another machine.
5. **Materialization**: scan history + imported history are re-materialized into the current timezone-specific dashboard store in `~/.codex-wrapped`.
6. **Pricing enrichment**: pricing is resolved locally from built-in mappings, and if a model is missing there, pricing data is fetched from [models.dev](https://models.dev) and cached for later lookups.
7. **UI rendering**: the local Bun server serves the dashboard, and the frontend queries local RPC endpoints to render cards/charts.

### CSV Schema Stability

Codex Wrapped treats the backup CSV schema as stable. Import/export column layout and semantics are intentionally fixed. Any future schema change must include an explicit migration/versioning plan before implementation.

## Architecture

- `bin/cli.ts` — CLI entrypoint and Bun server bootstrap
- `src/bun` — scanning, parsing, aggregation, persistence
- `src/mainview` — React dashboard UI
- `src/shared` — shared schemas/types
- `~/.codex` — source Codex session logs
- `~/.codex-wrapped` — local scan/import history, imported CSV copies, and the materialized dashboard store

## Privacy

Codex Wrapped is local-first.

- Codex session logs are read locally from `~/.codex`
- Aggregated summaries are stored in `~/.codex-wrapped`
- Imported CSV backups are copied into `~/.codex-wrapped/imports`
- Pricing fallback may fetch model pricing metadata from [models.dev](https://models.dev) when a model is not available in the local pricing map
- No external telemetry is required for core functionality

## FAQ

### Why Is Only One of My Similar Repositories Shown?

Codex Wrapped consolidates similar repository names to avoid duplicate-looking entries in the Top Repos view. It groups names that share meaningful tokens and displays one canonical name. The card also shows only the top 8 repositories, so lower-ranked entries may not appear.

### How Are Most Active Hour and Busiest Day of Week Calculated?

Most active hour is calculated from the selected date range by summing activity per hour of day (0-23) and selecting the hour with the highest token total. Busiest day of week is calculated by summing tokens by weekday across the selected range and selecting the highest total. There is currently no separate "most active week" metric; weekly patterns are represented through the heatmap.

### What Counts as a Session?

A session is one parsed Codex session record (source + session ID) from your local logs. During scanning, duplicate copies of the same session ID are deduplicated, and the preferred/latest copy is used for aggregation.

### Why Don’t Input and Output Tokens Add Up to Total Tokens?

Total tokens include more than input and output. Codex Wrapped totals:
- input tokens
- output tokens
- cached input/read tokens
- cache write tokens
- reasoning tokens

Because of this, `input + output` will be lower than total whenever cache or reasoning tokens are present.

### Why Was My Import Rejected?

Imports are validated by the backend and can be rejected when:
- the same backup file was already imported (checksum duplicate)
- the CSV is invalid or not a Codex Wrapped backup format/schema
- importing it would not change what is currently shown
- it only contains dates already covered by local data

When an import is rejected, the popup message shows the backend reason directly.

## Troubleshooting

- If the UI looks stale, run `bun ./bin/cli.ts --rebuild`.
- If data seems outdated, trigger a refresh/scan from the app and ensure your Codex directory exists.
- To move to a new computer, export a CSV backup from the footer on the old machine, then import that CSV from the footer on the new machine.
- To save a card image, use the save icon on the top-right edge of each card; desktop browsers download PNG, and supported mobile browsers may open native save options.
- If the launcher reports an older server is still running, close duplicate `bun ./bin/cli.ts` processes and relaunch. The launcher will now try to stop stale Codex Wrapped processes automatically before starting.
- If port `3210` is busy, set `PORT` before launch:

```bash
PORT=4321 bun ./bin/cli.ts
```
