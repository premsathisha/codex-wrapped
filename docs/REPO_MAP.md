# Repo Map
Last Updated: 2026-06-04

## Use This Map First
This file is the canonical repository map for coding agents. Read it before broad scanning or indexing, then freely inspect any files needed to understand the task, verify the map, or investigate missing context.

## Project Summary
Codex Wrapped is a local-first Bun app that scans Codex session logs, normalizes them into durable local history, and renders a Wrapped-style dashboard with cards, charts, trends, import/export, and save-as-image actions.

## Tech Stack
- Bun for runtime, CLI, tests, and scripts.
- TypeScript + React + Vite for the frontend.
- Tailwind CSS plus shared shadcn-style primitives.
- Recharts for charting.
- Biome for formatting, Oxlint for linting, and Bun test for test execution.

## Entry Points
- `bin/cli.ts`: primary CLI and Bun server bootstrap. Supports `--help`, `--version`, and `--uninstall`.
- `Open Codex Wrapped.command`: macOS launcher that builds if needed, starts the server, and opens the local URL.
- `src/bun/index.ts`: backend server, RPC, SSE, scan orchestration, and static asset serving.
- `src/mainview/index.ts`: React root mount.
- `index.html`: Vite HTML shell.
- Exact commands used by the repo:
  - `bun install`
  - `bun ./bin/cli.ts`
  - `bun run build`
  - `bun run dev`
  - `bun run dev:hmr`
  - `bun run typecheck`
  - `bun run lint`
  - `bun run format:check`
  - `bun run format`
  - `bun test`
  - `bun run prepare`
  - `bun run clean`
  - `bun pm pack --dry-run`
  - `bun ./bin/cli.ts --help`
  - `bun ./bin/cli.ts --version`
  - `bun ./bin/cli.ts --uninstall`
  - `PORT=4321 bun ./bin/cli.ts`

## Folder Map
### `.`
Purpose: repository root for package scripts, build config, launcher files, docs, and legal notices.
Edit here when:
- commands, build/runtime defaults, release metadata, or top-level docs change.
Important files:
- `package.json`
- `README.md`
- `AGENTS.md`
- `index.html`
- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.typecheck.json`
- `biome.json`
- `components.json`
- `ThirdPartyNotices.txt`
- `LICENSE`
- `Open Codex Wrapped.command`

### `bin/`
Purpose: CLI entrypoint and macOS launch wrapper.
Edit here when:
- startup flow, CLI flags, uninstall behavior, or local server launch logic change.
Important files:
- `cli.ts`
- `launch-macos.sh`

### `docs/`
Purpose: operational and validation documentation.
Edit here when:
- testing steps, packaging checks, or manual regression guidance change.
Important files:
- `TESTING.md`
- `REJECTED CHANGES.md`

### `scripts/git-hooks/`
Purpose: repo-managed validation helpers for pre-commit and pre-push checks.
Edit here when:
- hook scope, file filtering, or validation commands change.
Important files:
- `precommit.ts`
- `prepush.ts`
- `format-check.ts`
- `utils.ts`

### `.githooks/`
Purpose: Git hook entry scripts invoked by repository-managed commit and push checks.
Edit here when:
- pre-commit or pre-push hook entry behavior changes.
Important files:
- `pre-commit`
- `pre-push`

### `assets/`
Purpose: public images and brand assets served by Vite or used by the UI.
Edit here when:
- favicon, logo, or marketing screenshot assets change.
Important files:
- `screenshot.png`
- `Website Favicon/`
- `Website Icon (logo on page : header)/`

### `src/`
Purpose: source root for the app code and Vite ambient typings.
Edit here when:
- shared type declarations or source tree conventions change.
Important files:
- `vite-env.d.ts`

### `src/bun/`
Purpose: backend session discovery, parsing, normalization, aggregation, persistence, pricing, history, and RPC server logic.
Edit here when:
- scan pipeline, data model, storage format, pricing fallback, or API behavior change.
Important files:
- `index.ts`
- `scan.ts`
- `store.ts`
- `history.ts`
- `aggregator.ts`
- `dashboardSummary.ts`
- `pricing.ts`
- `external.ts`
- `normalizer.ts`
- `session-schema.ts`

### `src/bun/discovery/`
Purpose: source-specific file discovery for supported Codex logs.
Edit here when:
- session path resolution, discoverable source support, or discovery utilities change.
Important files:
- `index.ts`
- `codex.ts`
- `types.ts`
- `utils.ts`
- `codex.test.ts`

### `src/bun/parsers/`
Purpose: parse raw session files into normalized sessions and fall back to generic parsing when needed.
Edit here when:
- raw session formats, parser fallback rules, or parser types change.
Important files:
- `index.ts`
- `codex.ts`
- `generic.ts`
- `types.ts`
- `codex.test.ts`
- `generic.test.ts`

### `src/mainview/`
Purpose: React app root, global styles, dashboard layout, and frontend data flow.
Edit here when:
- user-facing UI, theme behavior, or app-shell styling changes.
Important files:
- `App.tsx`
- `index.ts`
- `index.css`

### `src/mainview/components/`
Purpose: dashboard screens, cards, charts, footer actions, and scan/status UI.
Edit here when:
- visual layout, chart behavior, export/share actions, or card interactions change.
Important files:
- `Dashboard.tsx`
- `DashboardCharts.tsx`
- `DashboardFooter.tsx`
- `DownloadableCard.tsx`
- `EmptyState.tsx`
- `ScanningStatus.tsx`
- `Sidebar.tsx`
- `SmoothSurface.tsx`
- `StatsCards.tsx`
- `DashboardCharts.test.ts`
- `DashboardFooter.test.tsx`
- `DownloadableCard.test.ts`

### `src/mainview/hooks/`
Purpose: dashboard data fetching, RPC bridging, and model key helpers.
Edit here when:
- API wiring, dashboard data shaping, or model key normalization change.
Important files:
- `useDashboardData.ts`
- `useRPC.ts`
- `modelKeys.ts`
- `useDashboardData.test.ts`
- `modelKeys.test.ts`

### `src/mainview/lib/`
Purpose: dashboard-specific copy, formatting, activity math, heatmap logic, hourly helpers, and theme palettes.
Edit here when:
- display calculations, chart labels, theme colors, or activity summaries change.
Important files:
- `activity.ts`
- `formatters.ts`
- `heatmap.ts`
- `heatmapColors.ts`
- `heroCopy.ts`
- `hourly.ts`
- `constants.ts`
- `themePalettes.ts`
- `activity.test.ts`
- `formatters.test.ts`
- `heatmap.test.ts`
- `heatmapColors.test.ts`
- `heroCopy.test.ts`
- `hourly.test.ts`

### `src/shared/`
Purpose: shared schema, types, local date helpers, and reusable UI utility code.
Edit here when:
- backend/frontend contracts, cross-app helpers, or shared primitives change.
Important files:
- `schema.ts`
- `types.ts`
- `session-types.ts`
- `localDate.ts`
- `localDate.test.ts`

### `src/shared/components/ui/`
Purpose: shared UI primitives used across the dashboard.
Edit here when:
- low-level component behavior or styling needs to change everywhere.
Important files:
- `chart.tsx`
- `dropdown-menu.tsx`
- `sonner.tsx`
- `spinner.tsx`

### `src/shared/lib/`
Purpose: small shared utility helpers.
Edit here when:
- cross-app utility behavior changes.
Important files:
- `utils.ts`

## File Map
### Root Files
| File | Purpose |
|---|---|
| `package.json` | Defines the package identity, Bun-exposed binary, dependency graph, and the command surface used for development, testing, building, cleaning, and packaging. It is the quickest place to understand how the repo is meant to be run and which top-level workflows the maintainers consider canonical. |
| `README.md` | Explains what Codex Wrapped does, how a user installs and launches it, and which workflows matter most for contributors. Use it to align the repo map with public-facing behavior and to verify that documented commands still match the live toolchain. |
| `AGENTS.md` | Captures repo-specific operating rules for coding agents, including validation expectations, non-negotiables, and task-specific guardrails that are not obvious from source code alone. It is the policy layer that sits above the rest of the map. |
| `index.html` | Provides the single Vite HTML shell that hosts the React app, including the mount node and any document-level metadata that must exist before the bundled frontend takes over. It matters when changing the browser shell rather than React component structure. |
| `vite.config.ts` | Configures how the frontend is built and served, including aliases, dev-server behavior, and production output assumptions that the Bun backend relies on when serving `dist`. It is the build boundary between the React bundle and the local app runtime. |
| `tsconfig.json` | Establishes the baseline TypeScript compiler settings, path resolution, and file-inclusion rules shared by source code and tooling. It tells you what the repo considers valid TypeScript structure and how imports are expected to resolve. |
| `tsconfig.typecheck.json` | Narrows TypeScript configuration specifically for the dedicated typecheck workflow so CI and local validation can compile the intended files with the intended assumptions. It is relevant when typecheck behavior diverges from editor behavior or build behavior. |
| `biome.json` | Describes the formatting and code-style rules enforced by the repo’s formatter checks. It is the source of truth for automated style normalization and for understanding why format-related checks fail. |
| `components.json` | Stores the shared UI component registry and alias configuration used by the shadcn-style component setup. It documents how low-level UI primitives are expected to be referenced and organized in this codebase. |
| `ThirdPartyNotices.txt` | Contains the legal attribution text bundled alongside the app for third-party dependencies. It matters when dependencies change in a way that affects licensing or bundled notice requirements. |
| `LICENSE` | Holds the repository’s license terms and is part of the project’s distribution and publishing surface, not application behavior. It is mainly relevant when the legal status of the project itself changes. |
| `Open Codex Wrapped.command` | Acts as the user-friendly macOS launcher wrapper that opens the local app without requiring a manual terminal workflow. It is the bridge between a desktop-style launch experience and the repo’s Bun-based startup scripts. |
| `.githooks/pre-commit` | Boots the repo-managed pre-commit validation flow from Git into the TypeScript helper scripts under `scripts/git-hooks/`. It exists so local Git activity consistently runs the validations the repo expects before commits land. |
| `.githooks/pre-push` | Boots the repo-managed pre-push validation flow from Git into the TypeScript helper scripts under `scripts/git-hooks/`. It is the last local enforcement point before changes leave the machine. |

### `bin/`
| File | Purpose |
|---|---|
| `cli.ts` | Implements the primary command-line entrypoint, including flag handling, version/help output, uninstall flow, and startup of the Bun server that powers the local app. It is the main handoff between user-invoked commands and the backend runtime. |
| `launch-macos.sh` | Provides the shell-based macOS launcher path that checks the local environment, makes sure the app can be started cleanly, and opens the browser to the correct local endpoint. It is the script version of the “double-click to run the app” experience. |

### `docs/`
| File | Purpose |
|---|---|
| `TESTING.md` | Documents the validation workflow beyond what package scripts alone reveal, especially manual checks, regression expectations, and the intended order of verification for user-facing changes. It is where process knowledge lives when source files themselves are not enough. |
| `REJECTED CHANGES.md` | Keeps a lightweight historical record of changes that were considered and intentionally not accepted, so future contributors do not re-propose the same work without new context. It functions as a decision-memory file rather than runtime documentation. |

### `scripts/git-hooks/`
| File | Purpose |
|---|---|
| `precommit.ts` | Orchestrates the staged-file checks that run before a commit is accepted, deciding which validations are cheap and relevant enough to enforce at commit time. It encodes the repo’s “fast local guardrail” policy. |
| `prepush.ts` | Orchestrates the broader validation pass that runs before a push, using upstream-aware context to decide what needs stronger checking than the pre-commit layer provides. It encodes the repo’s “don’t ship obviously broken changes” policy. |
| `format-check.ts` | Focuses on format validation for selected files without re-running unrelated checks, making the hook system faster and more targeted. It is a helper that narrows formatting work to the files Git says actually changed. |
| `utils.ts` | Centralizes Git-aware helper logic such as changed-file discovery and mapping files to the most relevant tests or validations. It is the shared glue that keeps the hook scripts consistent instead of duplicating file-selection logic. |

### `.githooks/`
| File | Purpose |
|---|---|
| `pre-commit` | Serves as the literal Git hook file Git executes before a commit, delegating into the repo-managed validation logic so hook behavior stays versioned inside the repository instead of hidden in a developer’s local config. |
| `pre-push` | Serves as the literal Git hook file Git executes before a push, delegating into the repo-managed validation logic so pre-push checks remain reproducible and visible in source control. |

### `assets/`
| File | Purpose |
|---|---|
| `screenshot.png` | Provides the canonical marketing and documentation screenshot used to show the product visually in places like the README or other explanatory surfaces. It is part of how the repo communicates the product without running it. |

### `assets/Website Favicon/`
| File | Purpose |
|---|---|
| `favicon.svg` | Holds the primary vector favicon artwork, which is the cleanest source asset for browser-tab branding and for generating other favicon variants. It is the most authoritative favicon design file in this folder. |
| `favicon.ico` | Packages the favicon into the legacy `.ico` format expected by browsers and environments that do not prefer SVG favicons. It is a compatibility export rather than the original artwork source. |
| `apple-touch-icon.png` | Supplies the icon used when the site is pinned or saved on Apple mobile home screens. It extends branding beyond the browser tab into install-like surfaces. |

### `assets/Website Icon (logo on page : header)/`
| File | Purpose |
|---|---|
| `logo.svg` | Stores the main vector header/logo artwork that represents the product across web-facing branded surfaces. It is the most flexible source asset for resizing, recoloring, or exporting additional branded variants. |
| `logo-512.png` | Provides a medium-resolution raster export of the main logo for contexts that cannot use SVG directly or that need a ready-to-ship bitmap asset. It is a derived display asset rather than the design master. |
| `logo-1024.png` | Provides a higher-resolution raster export of the main logo for larger displays, screenshots, and other contexts that need sharper bitmap branding. It is the large-format sibling to the 512px export. |

### `src/`
| File | Purpose |
|---|---|
| `vite-env.d.ts` | Declares the ambient TypeScript types Vite expects, making frontend code compile cleanly when it references Vite-specific globals or asset handling behavior. It is part of the frontend toolchain contract rather than app logic. |

### `src/bun/`
| File | Purpose |
|---|---|
| `index.ts` | Implements the Bun backend entrypoint, including startup orchestration, local HTTP endpoints, RPC handlers, and any server-sent events the frontend relies on for scan status or refresh behavior. It is the central backend composition file where the rest of the backend modules get wired into a working local app. |
| `scan.ts` | Coordinates the full scan lifecycle from discovery through parsing, normalization, aggregation triggers, progress reporting, and duplicate handling. It is the operational heart of “go inspect my Codex data and refresh the dashboard.” |
| `store.ts` | Owns local persisted state such as settings and day-level stored data, defining what the app remembers across launches and how that data is read and written. It is the persistence boundary for app-owned local state. |
| `history.ts` | Handles CSV import/export and the logic that reconstructs or merges historical dashboard data from backup files. It is the module that protects portability of a user’s wrapped data over time. |
| `aggregator.ts` | Turns normalized session events into rolled-up metrics using the repo’s timezone and bucketing rules. It is where low-level events become meaningful counts, timelines, and grouped statistics. |
| `dashboardSummary.ts` | Converts stored and aggregated data into the higher-level summary slices the UI expects, such as totals, rankings, trends, and card-ready summaries. It is the last shaping layer before data becomes dashboard content. |
| `pricing.ts` | Resolves pricing metadata for models, including built-in pricing knowledge and any fallback enrichment path used when a model is not covered by the local map. It directly affects spend-oriented metrics shown in the product. |
| `external.ts` | Groups backend-side logic for external URLs, export-related helpers, and other behaviors that touch surfaces beyond the local core scan/store flow. It is where “outside-facing helper behavior” lives. |
| `normalizer.ts` | Converts parsed source data into the canonical internal session shape the rest of the app expects, reducing source-specific quirks before aggregation and storage happen. It is the schema-stabilizing layer between parsers and downstream logic. |
| `session-schema.ts` | Defines and validates the raw session/event structure the backend expects to process. It is the data-shape contract that keeps upstream session parsing and downstream analytics speaking the same language. |
| `scan.test.ts` | Regression-tests the scan orchestration path, especially lifecycle transitions, candidate handling, and behavior around duplicate or repeated scan inputs. It protects the app’s most user-visible backend action. |
| `history.test.ts` | Regression-tests import/export and historical rematerialization logic so backup files remain trustworthy and compatible over time. It protects the stability of the product’s data portability story. |
| `store.test.ts` | Exercises the persistence layer for settings and stored data, verifying that local state is read, written, and interpreted consistently. It protects the app’s long-lived local memory. |
| `aggregator.test.ts` | Verifies aggregation and roll-up behavior, especially around bucketing and time-based grouping where subtle math mistakes can distort the dashboard. It protects the analytics layer from quiet drift. |
| `dashboardSummary.test.ts` | Verifies that summary-building logic produces the card- and chart-ready outputs the UI expects. It protects the semantic meaning of top-level dashboard numbers and rankings. |
| `pricing.test.ts` | Verifies pricing lookup behavior, including built-in model mappings and fallback resolution rules. It protects spend calculations from regressions that would undermine trust in cost-related metrics. |
| `external.test.ts` | Verifies the helper behavior around external links and export-adjacent logic. It protects the correctness of the backend code that reaches outside the core session-processing pipeline. |
| `normalizer.test.ts` | Verifies canonicalization of parsed session data so source differences do not leak into aggregation logic in inconsistent ways. It protects the contract between parsers and analytics. |
| `web-api.test.ts` | Verifies the behavior and payload shape of the Bun-served API/RPC surface that the frontend depends on. It protects the backend/frontend integration contract. |

### `src/bun/discovery/`
| File | Purpose |
|---|---|
| `index.ts` | Coordinates the discovery subsystem by selecting and combining supported source-discovery strategies into a single candidate stream for the scan pipeline. It is the top-level dispatcher for “where should we look for session files?” |
| `codex.ts` | Implements Codex-specific session-file discovery rules, including filesystem paths and candidate filtering that are unique to the Codex log layout. It is the repo’s source adapter for current Codex data. |
| `types.ts` | Defines the shared candidate and metadata shapes used by discovery modules so the scan pipeline can consume discovered files consistently. It is the type contract for the discovery stage. |
| `utils.ts` | Provides shared helper functions used across discovery modules for filesystem searching and candidate cleanup. It exists to keep discovery implementations small and consistent. |
| `codex.test.ts` | Verifies that Codex discovery finds the right files and excludes the wrong ones under realistic path scenarios. It protects the scan pipeline from missing or over-including Codex sessions. |

### `src/bun/parsers/`
| File | Purpose |
|---|---|
| `index.ts` | Chooses which parser should handle a discovered file and defines how fallback behavior works when the preferred parser cannot fully interpret the source. It is the control plane for turning raw files into parseable input. |
| `codex.ts` | Parses Codex session data into the repo’s intermediate parsed shape, translating Codex-specific event structure into fields the normalizer can understand. It is the main parser for the app’s primary supported source. |
| `generic.ts` | Provides a fallback parsing path for files that do not fit the most specialized parser but still contain usable structured session data. It keeps the app resilient when source formats vary. |
| `types.ts` | Defines parser-facing raw types and the parsed output contracts that downstream normalization depends on. It is the data-shape boundary for the parsing stage. |
| `codex.test.ts` | Verifies that Codex parsing keeps extracting the intended fields when log structure evolves or edge cases appear. It protects the primary parse path from silent schema drift. |
| `generic.test.ts` | Verifies fallback parsing behavior so non-ideal inputs still produce predictable parsed output. It protects the repo’s resilience path for less-structured inputs. |

### `src/mainview/`
| File | Purpose |
|---|---|
| `App.tsx` | Composes the top-level React app shell, including theme synchronization, providers, and global UI hosts such as toasts. It is the frontend equivalent of the backend entrypoint composition layer. |
| `index.ts` | Boots the React application into the DOM by connecting the frontend bundle to the HTML mount point. It is the thinnest and most important bridge between built assets and the running UI. |
| `index.css` | Defines global CSS variables, base styles, and app-wide visual defaults that the rest of the component tree inherits. It establishes the visual foundation beneath component-level styling. |

### `src/mainview/components/`
| File | Purpose |
|---|---|
| `Dashboard.tsx` | Lays out the main dashboard page by combining the sidebar, cards, charts, and state-driven sections into the user-facing wrapped experience. It is the primary composition file for the visible product. |
| `DashboardCharts.tsx` | Renders the chart-heavy parts of the dashboard, translating summary data into the visual comparisons and timelines the product emphasizes. It is where analytics become visual storytelling. |
| `DashboardFooter.tsx` | Owns footer-level actions such as import/export workflows, backup feedback, and lower-priority links or controls that support the main dashboard. It is the action strip for non-primary but important user operations. |
| `DownloadableCard.tsx` | Wraps dashboard cards with the behavior needed to save or share them as images, turning normal UI panels into exportable assets. It is the reusable bridge between display cards and downloadable outputs. |
| `EmptyState.tsx` | Presents the no-data experience when scans have not yet produced usable dashboard content. It shapes first-run and failure-adjacent perception of the product. |
| `ScanningStatus.tsx` | Presents scan progress, loading, and status transitions so the user understands what the backend is doing and whether they should wait, retry, or inspect results. It is the frontend face of scan lifecycle state. |
| `Sidebar.tsx` | Renders the dashboard’s navigation and filtering controls, including the user’s path to switching views or changing the slice of data they are looking at. It is the steering wheel for the dashboard. |
| `SmoothSurface.tsx` | Supplies a shared surface/chrome treatment used to make cards and panels visually consistent. It is a styling abstraction for the product’s polished visual layer. |
| `StatsCards.tsx` | Renders the top-line metric cards that summarize the most important numbers in the wrapped experience. It is the high-signal headline layer of the dashboard. |
| `DashboardCharts.test.ts` | Verifies that chart-oriented UI logic and rendering assumptions remain stable as data-shaping behavior evolves. It protects the frontend analytics presentation layer. |
| `DashboardFooter.test.tsx` | Verifies footer actions, import/export behavior, and feedback presentation around backup workflows. It protects the UI path for data portability operations. |
| `DownloadableCard.test.ts` | Verifies the export/share behavior of downloadable cards so save-as-image interactions stay reliable. It protects one of the product’s most visibly shareable features. |

### `src/mainview/hooks/`
| File | Purpose |
|---|---|
| `useDashboardData.ts` | Fetches backend data and reshapes it into the frontend state model the dashboard components consume. It is the main data-adaptation hook between the RPC layer and the visible UI. |
| `useRPC.ts` | Encapsulates the frontend’s communication with the Bun backend, including request/response handling and any event-driven integration points. It is the network bridge for the local app even though the app is entirely local-first. |
| `modelKeys.ts` | Normalizes model identifiers into the naming and grouping conventions the UI expects to display. It is the small but important semantic cleanup layer for model-oriented metrics. |
| `useDashboardData.test.ts` | Verifies that the main data hook continues to produce the right derived UI state from backend payloads. It protects the frontend’s interpretation layer. |
| `modelKeys.test.ts` | Verifies model-key normalization behavior so naming drift or new model strings do not fragment the dashboard unexpectedly. It protects consistent grouping of model-related metrics. |

### `src/mainview/lib/`
| File | Purpose |
|---|---|
| `activity.ts` | Implements the activity and streak calculations that power engagement-oriented summaries in the UI. It is where raw counts become behavior-oriented story points. |
| `formatters.ts` | Centralizes shared formatting for numbers, dates, labels, and other user-visible text fragments so the dashboard speaks consistently everywhere. It is the presentation cleanup layer for otherwise raw values. |
| `heatmap.ts` | Builds the data structure and layout assumptions behind the heatmap-style visualizations. It is the shaping logic that turns time-bucketed activity into a grid the UI can render. |
| `heatmapColors.ts` | Defines how heatmap intensity maps to actual displayed colors, controlling the visual readability of the activity heatmap. It is the translation layer from numeric activity to visual emphasis. |
| `heroCopy.ts` | Generates or selects the summary-style copy shown in prominent dashboard areas, especially the narrative framing around the user’s usage. It influences the product’s voice as much as its data. |
| `hourly.ts` | Handles hourly bucketing, labeling, and helper logic for time-of-day views. It supports charts and summaries that need a consistent understanding of hourly activity. |
| `constants.ts` | Collects shared dashboard constants so repeated thresholds, defaults, and fixed values stay centralized instead of spreading magic numbers through the UI. It is the repo’s local parameter shelf for the frontend. |
| `themePalettes.ts` | Defines the available theme palette values used by the UI. It is where visual system choices become structured, reusable data rather than scattered style fragments. |
| `activity.test.ts` | Verifies activity and streak math so engagement summaries do not quietly drift as logic changes. It protects the behavioral interpretation layer of the dashboard. |
| `formatters.test.ts` | Verifies display formatting behavior for user-visible values and labels. It protects consistency in the way numbers and dates are presented. |
| `heatmap.test.ts` | Verifies the heatmap data-shaping logic so grids remain accurate when bucket rules or input data evolve. It protects a dense visual summary component. |
| `heatmapColors.test.ts` | Verifies that the color-mapping layer behaves as intended across activity levels. It protects visual legibility and consistency of the heatmap. |
| `heroCopy.test.ts` | Verifies the summary-copy generation behavior so visible narrative text stays aligned with the product’s expected output. It protects the human-readable framing layer. |
| `hourly.test.ts` | Verifies hourly bucketing and label logic so time-of-day summaries stay stable and interpretable. It protects time-based frontend summaries from off-by-one and grouping regressions. |

### `src/shared/`
| File | Purpose |
|---|---|
| `schema.ts` | Defines shared schema structures for dashboard and session-related data that must be understood the same way by backend and frontend code. It is one of the strongest contract files in the repo. |
| `types.ts` | Defines shared TypeScript types for settings, RPC results, and other cross-runtime payloads that move between the Bun server and React UI. It is the typed vocabulary of the application boundary. |
| `session-types.ts` | Defines the core session and event types used to describe processed usage data throughout the codebase. It is the semantic backbone for the product’s data model. |
| `localDate.ts` | Implements timezone-aware date helpers and streak-adjacent date math that both runtime layers may rely on. It protects the app from subtle date-boundary inconsistencies. |
| `localDate.test.ts` | Verifies timezone-aware helper behavior so date calculations remain stable across midnight boundaries and other edge cases. It protects a deceptively fragile utility area. |

### `src/shared/components/ui/`
| File | Purpose |
|---|---|
| `chart.tsx` | Provides shared chart primitives that let multiple dashboard components render charts with consistent structure and styling assumptions. It is the low-level chart toolkit for the frontend. |
| `dropdown-menu.tsx` | Provides the shared dropdown-menu primitive used across interactive UI surfaces. It centralizes menu behavior and styling instead of duplicating menu wiring in each feature component. |
| `sonner.tsx` | Integrates the shared toast/notification system so user feedback can be displayed consistently across the app. It is the frontend’s common popup-feedback entrypoint. |
| `spinner.tsx` | Provides the shared loading indicator component used wherever the UI needs to show pending work. It is a small but common primitive for expressing app activity state. |

### `src/shared/lib/`
| File | Purpose |
|---|---|
| `utils.ts` | Houses small shared utility helpers such as class-name composition, allowing many components to reuse the same low-level behavior without copy-pasting tiny helpers. It is the “common glue” shelf for simple shared frontend utilities. |

## Architecture Notes
- Local-first by design: source logs live under `~/.codex` and the materialized dashboard state lives under `~/.codex-wrapped`.
- The backend flow is discovery -> parse -> normalize -> aggregate -> persist -> summarize -> serve.
- `src/bun/index.ts` exposes the local RPC surface and SSE events that the React app consumes through `src/mainview/hooks/useRPC.ts`.
- Normal app startup serves built assets from `dist`; the dev HMR path uses Vite on port `5173` and points the backend at `VITE_DEV_SERVER_URL`.
- Pricing is resolved locally first, with a fallback lookup path for models that are missing from the built-in map.
- CSV import/export is treated as a stable backup format; schema and column meaning should not change without an explicit migration plan.
- Theme and dashboard state are driven by settings returned from the backend and mirrored into the UI at load time.
- The default local app URL is `http://127.0.0.1:3210`, and the launcher tries to recover from stale local server processes before opening it.

## Common Tasks → Files To Edit
| Task Type | Start Here | Usually Also Check |
|---|---|---|
| Change CLI flags or launch behavior | `bin/cli.ts`, `bin/launch-macos.sh` | `README.md`, `AGENTS.md` |
| Adjust session discovery | `src/bun/discovery/index.ts`, `src/bun/discovery/codex.ts`, `src/bun/scan.ts` | `src/bun/discovery/types.ts`, `src/bun/discovery/utils.ts` |
| Fix parsing or normalization | `src/bun/parsers/index.ts`, `src/bun/parsers/codex.ts`, `src/bun/parsers/generic.ts`, `src/bun/normalizer.ts` | `src/bun/parsers/types.ts`, `src/bun/session-schema.ts` |
| Change aggregation or date rollups | `src/bun/aggregator.ts`, `src/shared/localDate.ts`, `src/bun/dashboardSummary.ts` | `src/bun/history.ts`, `src/shared/schema.ts` |
| Change pricing or cost logic | `src/bun/pricing.ts`, `src/bun/dashboardSummary.ts` | Related tests in `src/bun/*.test.ts` |
| Change import/export or local history | `src/bun/history.ts`, `src/bun/store.ts`, `src/mainview/components/DashboardFooter.tsx` | `docs/TESTING.md`, `src/shared/types.ts` |
| Change server/API contracts | `src/bun/index.ts`, `src/shared/types.ts`, `src/mainview/hooks/useRPC.ts` | `src/mainview/App.tsx`, `src/bun/web-api.test.ts` |
| Change the dashboard UI | `src/mainview/App.tsx`, `src/mainview/components/*`, `src/mainview/index.css` | `src/mainview/hooks/useDashboardData.ts`, `src/mainview/lib/*` |
| Change shared schema or helpers | `src/shared/schema.ts`, `src/shared/types.ts`, `src/shared/localDate.ts`, `src/shared/lib/utils.ts` | `src/shared/session-types.ts`, `src/shared/components/ui/*` |
| Change build or repo validation commands | `package.json`, `scripts/git-hooks/*`, `docs/TESTING.md` | `README.md`, `AGENTS.md` |

## Testing And Validation
- Baseline automated checks: `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun test`.
- Frontend changes: run `bun run build` before starting `bun ./bin/cli.ts`, then verify the live app at `http://127.0.0.1:3210`.
- Hot-reload development: `bun run dev:hmr`.
- Launcher validation: confirm `Open Codex Wrapped.command` starts the app, handles stale servers, and opens the local URL.
- Packaging sanity check: `bun pm pack --dry-run`.
- If the UI looks stale, rebuild first; do not validate frontend behavior against an old `dist` bundle.
- If port `3210` is occupied, use `PORT=4321 bun ./bin/cli.ts` or another free port during local verification.

## Known Generated Or External Files
- `assets/screenshot.png`: exported screenshot asset, likely regenerated when the UI changes materially.
- `assets/Website Favicon/*`: exported icon assets, not application logic.
- `assets/Website Icon (logo on page : header)/*`: branded raster/vector exports, not source-of-truth code.
- `ThirdPartyNotices.txt`: external attribution file.
- `LICENSE`: external legal text.
- `dist/`: generated build output; do not treat it as source.

## Stale Or Unclear Areas
- `Open Codex Wrapped.command` is macOS-only and should be verified on a Mac if launcher behavior changes.
- The image assets in `assets/` look export-like rather than hand-authored source art. If branding changes, update the upstream design source first.

## How To Update This Map
1. Update only the affected section.
2. Keep descriptions short and factual.
3. Do not paste large code snippets.
4. Prefer navigation value over exhaustive implementation detail.
