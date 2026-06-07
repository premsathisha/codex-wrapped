# Testing Guide

Use this guide when validating changes to Codex Wrapped. Keep checks focused on
the behavior that changed, then broaden them when the change affects shared
parsing, aggregation, persistence, or UI behavior.

## Automated Checks

Install dependencies before the first run:

```bash
bun install
```

Run the full baseline:

```bash
bun run typecheck
bun run lint
bun run format:check
bun test
```

For a focused test file:

```bash
bun test path/to/file.test.ts
```

## Frontend Validation

Frontend changes must be built before validating the normal app flow:

```bash
bun run build
bun ./bin/cli.ts
```

Open `http://127.0.0.1:3210` and verify the affected behavior in the live app.
Restart an existing server before checking changes so it cannot serve stale
assets.

For active frontend development with hot module replacement:

```bash
bun run dev:hmr
```

## Manual Regression Checklist

### Scanning And Data

- Trigger a scan and confirm loading ends on success and failure.
- Confirm dashboard totals and date ranges update after a completed scan.
- Verify source session logs under `~/.codex` are never modified.
- For duplicate-session changes, confirm `scanned` counts unique ingested
  sessions rather than raw candidate files.

### Pricing And Dates

- Check known and fallback model pricing paths when pricing behavior changes.
- Verify timezone-sensitive output around midnight and date-range boundaries.
- Confirm total-token calculations still include cache and reasoning tokens.

### Import And Export

- Export a CSV backup and confirm it can be imported into a clean local state.
- Verify successful imports show the backend success message.
- Verify rejected imports show the backend rejection reason.
- Repeat an identical import attempt and confirm its popup appears again.

### Dashboard UI

- Check the affected card at desktop and narrow viewport widths.
- Confirm charts remain readable and use visible colors at boundary item counts.
- Verify card PNG save behavior when download or export code changes.
- Confirm reduced-motion behavior remains correct when animation code changes.

## Packaging Check

Before publishing the npm package, inspect the package contents:

```bash
bun pm pack --dry-run
```

Confirm the built frontend, runtime files, `LICENSE`, and
`ThirdPartyNotices.txt` are included.
