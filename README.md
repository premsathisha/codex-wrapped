# AI Wrapped

AI Wrapped is a local dashboard that summarizes your coding activity across AI coding tools in a Spotify Wrapped-style view.
This repository is forked from [gulivan/ai-wrapped](https://github.com/gulivan/ai-wrapped).

It scans local session files, builds daily aggregates, and serves a local web app.

## What It Tracks

- Sessions
- Messages and tool calls
- Token usage
- Cost estimates
- Model and agent breakdowns
- Daily/hourly activity trends
- Top repositories

Supported source currently: Codex.

## Requirements

- Bun (latest stable)
- macOS, Linux, or Windows
- Local Codex history files in your home directory (`~/.codex`)

## Quick Start

1. Install dependencies:

```bash
bun install
```

2. Build the frontend:

```bash
bun run build
```

3. Start the app:

```bash
bun ./bin/cli.ts
```

4. Open:

`http://127.0.0.1:3210`

On macOS you can also double-click `AI Wrapped Launcher.app` in the repo root to start the local server and open the app without using Terminal.

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

Run tests:

```bash
bun test
```

Clean build artifacts:

```bash
bun run clean
```

## CLI Options

```bash
bun ./bin/cli.ts --help
```

Common options:

- `--version` or `-v`: show app version
- `--rebuild`: rebuild frontend before launch
- `--uninstall`: remove local AI Wrapped data at `~/.ai-wrapped`

## macOS Launcher

- `AI Wrapped Launcher.app`: double-clickable macOS launcher for this repo
- `bin/launch-macos.sh`: starts `bun ./bin/cli.ts` in the background if needed and opens `http://127.0.0.1:3210`

## Data and Privacy

- The app is local-first.
- It reads local session files from supported tools.
- Aggregated output is stored in `~/.ai-wrapped`.
- No hosted API is required for core functionality.

## Troubleshooting

- If the UI looks stale, run `bun ./bin/cli.ts --rebuild`.
- If data seems outdated, trigger a refresh/scan from the app and ensure your source directories exist.
- If port `3210` is busy, set `PORT` before launch:

```bash
PORT=4321 bun ./bin/cli.ts
```

## Release Notes

This repository uses Conventional Commits with automated releases on `main` via semantic-release.
