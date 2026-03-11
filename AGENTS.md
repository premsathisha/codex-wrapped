---
description: Project agent instructions for AI Wrapped (local Bun web app).
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

This project runs as a **local Bun web app**.

## Runtime and Commands

- Use Bun for everything (`bun`, `bun run`, `bun test`, `bunx`).
- Do not add Node-only tooling when Bun already covers it.
- Main run command: `bun ./bin/cli.ts`
- Dev command: `bun run dev`
- Build command: `bun run build`

## Commits

Use conventional commits. Releases are automated via `semantic-release` on push to `main`.

- `fix: <message>` — patch release (0.0.1 → 0.0.2)
- `feat: <message>` — minor release (0.0.1 → 0.1.0)
- `feat!: <message>` or `BREAKING CHANGE:` in footer — major release (0.0.1 → 1.0.0)
- `chore:`, `docs:`, `refactor:`, `test:`, `ci:` — no release

## App Architecture

- Local backend server: `src/bun/index.ts` via `Bun.serve()`.
- Main dashboard frontend: root `index.html` + `src/mainview/*`.
- Data sources remain local (`~/.codex`, `~/.claude`, etc.) and aggregate into `~/.ai-wrapped/daily.json`.
- This repository is local-first and should not depend on hosted API routes.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend Notes

- Keep current visual system and component structure unless a redesign is explicitly requested.
- Preserve desktop/mobile behavior.
- Avoid reintroducing social/share buttons unless explicitly requested.

## Documentation

- `CODEX.md` is merged into this file.
- Keep README and AGENTS aligned with real runtime behavior and scripts.
