# AGENTS.md

This file is the repo-specific operating guide for agents working in Codex Wrapped. It should help you make good decisions quickly without turning into a second repo map.

## Start Here
- Read `docs/REPO MAP.md` before broad scanning or indexing.
- Use the repo map as the navigation layer and this file as the policy layer.
- When architecture, meaningful files, or folder responsibilities change, update only the affected parts of `docs/REPO MAP.md`.
- Read `docs/TESTING.md` before claiming a behavior change is verified.

## Product Priorities
- Keep the app local-first. Core scanning, storage, aggregation, import/export, and dashboard behavior should keep working without a hosted backend.
- Prefer the fastest-feeling user path when tradeoffs are unclear, but not at the expense of data integrity or understandable behavior.
- Favor good defaults over extra knobs. This app should feel useful immediately after launch.
- Preserve convenience and low friction. Avoid adding blocking setup, noisy confirmations, or new manual steps unless the task explicitly calls for them.
- Be thoughtful about safety: convenience is good, but not if it weakens local data handling or opens unsafe external behavior.

## Core Invariants
- Never mutate or delete source Codex session logs under `~/.codex` as part of normal feature work.
- Aggregated app data under `~/.codex-wrapped` is a product surface, not disposable scratch data.
- Treat CSV import/export as a stable user contract. Do not casually change column meaning, validation behavior, duplicate handling, or import rejection semantics.
- Backend-produced import/export feedback text is user-facing contract. Do not replace specific rejection reasons with vague UI copy.
- Pricing fallback is allowed, but it is fallback-only. Do not make remote pricing metadata a hard dependency for normal app use.

## Data And Storage Rules
- Be careful with timezone-sensitive aggregation, day boundaries, and historical rematerialization. Small date mistakes here create misleading Wrapped results.
- If you touch persistence, review both the default `~/.codex-wrapped` flow and any override path using `CODEX_WRAPPED_DATA_DIR`.
- Preserve legacy-data migration behavior from older storage locations unless the task explicitly includes a migration change.
- Keep scans deterministic and non-destructive. A rescan should improve or refresh local state, not produce surprising churn.
- When changing repo/model/tool grouping logic, validate that the top lists, totals, and time-series views still agree with one another.

## UI And Experience Rules
- Preserve the existing Wrapped-style visual language unless the user explicitly asks for a redesign.
- Performance matters. Avoid UI choices that make scanning, filter changes, or dashboard transitions feel sluggish.
- For Lisse-style surface work, audit all relevant layers: shared wrappers, CSS-only surfaces, chart containers, export cards, and third-party shells such as Sonner toasts.
- Do not smooth or round surfaces that are intentionally sharp, especially chart details or comparison elements where that shape is part of the design.
- Save-as-image behavior is a real product feature. Treat export-card layout, clipping, and share/download behavior as first-class, not cosmetic.
- Reduced-motion behavior and narrow-width layout are part of the supported experience. Do not assume desktop-only validation is enough.

## Build, Test, And Verify
- Use Bun and the repo scripts rather than ad hoc replacements.
- Default checks after meaningful code edits:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run format:check`
  - `bun test`
- Frontend changes must be validated against a fresh build, not stale assets:
  - `bun run build`
  - `bun ./bin/cli.ts`
- Use `bun run dev:hmr` only for active iteration. Before handoff, rebuild and verify the normal live app flow.
- If a change touches package contents, launcher behavior, or publishable assets, also run `bun pm pack --dry-run`.

## Verification Expectations
- For dashboard UI changes, verify the affected surface in the live local app.
- For chart or summary changes, verify totals, labels, and rankings stay internally consistent.
- For import/export work, test:
  - successful import
  - duplicate import rejection
  - no-op or overlap rejection behavior
  - the exact user-facing success or rejection message
- For visual/export work, verify:
  - narrow viewport behavior
  - chart readability at boundary counts
  - PNG save flow
  - reduced-motion behavior when relevant
- For scan or aggregation work, confirm results remain stable across a refresh and do not corrupt prior local history.
- If you cannot run a relevant check, say that plainly in the handoff.

## Packaging And Release Notes
- This repo publishes a deliberately narrow file set. If you change packaging, confirm the intended files still ship and unwanted files still stay out.
- Keep `README.md`, CLI behavior, and package contents aligned when commands or launch behavior change.
- Release-related changes should preserve the distinction between source, built frontend output, and runtime files used by the published package.

## Boundaries
- Do not turn `AGENTS.md` into a second `docs/REPO MAP.md`. Structural indexing belongs in the repo map.
- Prefer small, targeted changes over broad rewrites unless the task clearly requires a larger refactor.
- Do not introduce hosted dependencies, telemetry, or background network behavior for core product paths unless explicitly requested.
- Avoid destructive cleanup of user data, imported backups, or local history unless the user explicitly asks.

## Handoff Expectations
- Summaries should explain what changed, what was verified, and any remaining risk areas.
- If a change touched data contracts, import/export, pricing, or time handling, call that out explicitly.
- If a change likely needs a follow-up rebuild, export check, or manual UI pass, say so clearly.
