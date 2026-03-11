<p align="center">
  <img src="assets/icons/icon.png" width="128" height="128" alt="AI Wrapped icon" />
</p>

<h1 align="center">AI Wrapped</h1>

<p align="center">
  Local web dashboard for AI coding agent activity
</p>

Owner: **premsathisha**  
Forked from: [https://github.com/gulivan/ai-wrapped](https://github.com/gulivan/ai-wrapped)

Built on top of [agent-sessions](https://github.com/jazzyalex/agent-sessions) session format discovery — reads JSONL/JSON session logs that AI coding agents write to disk.

## Supported Agents

- **Claude Code** — `~/.claude/projects/` JSONL sessions + subagent logs
- **OpenAI Codex** — Codex CLI session files
- **Google Gemini CLI** — Gemini session logs
- **OpenCode** — OpenCode session data
- **Droid** — Droid session files
- **GitHub Copilot** — Copilot session logs

## What It Shows

- Total sessions, messages, tool calls, tokens, and estimated cost
- Daily activity timeline with per-agent and per-model breakdown
- Cost breakdown by model (Claude Opus, Sonnet, GPT-4o, Gemini Pro, etc.)
- Agent usage distribution (pie chart)
- Time spent — total hours, average session duration, longest session, current streak, active day coverage ring
- Top repositories with sessions, tokens, cost, and duration
- Coding hours — 24-hour activity breakdown by agent

## Quick start

```bash
bun install
bun run build
bun ./bin/cli.ts
```

Open: `http://127.0.0.1:3210`

## Stack

- **Runtime**: [Bun](https://bun.sh)
- **Backend**: Bun HTTP server
- **Frontend**: React + Tailwind CSS + Recharts
- **Build**: Vite
- **Storage**: JSON files in `~/.ai-wrapped/`

## Getting Started

```bash
bun install
```

### Development

```bash
bun run dev
```

## How It Works

1. On launch (and every 5 minutes by default), the app scans known session directories for each agent
2. New or changed session files are parsed into a normalized format with token counts, tool calls, and cost estimates
3. Aggregated daily stats are written to `~/.ai-wrapped/daily.json`
4. The frontend fetches summaries over HTTP and renders the Wrapped-style dashboard
