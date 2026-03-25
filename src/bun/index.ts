import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  EMPTY_TOKEN_USAGE,
  SESSION_SOURCES,
  type DailyAggregate,
  type DashboardSummary,
  type HourlyBreakdownEntry,
  type SessionSource,
  type TokenUsage,
  type TrayStats,
} from "../shared/schema";
import { toLocalISODate } from "../shared/localDate";
import type { AppSettings } from "../shared/types";
import { resolveAggregationTimeZone } from "./aggregator";
import { buildTopRepos } from "./dashboardSummary";
import { getOpenExternalCommand, tryResolveAllowedExternalUrl } from "./external";
import { runScan } from "./scan";
import {
  createEmptyDayStats,
  dailyStoreMissingHourDimension,
  dailyStoreMissingRepoDimension,
  getSettings,
  hasTrackedActivity,
  readDailyStore,
  setSettings,
  type DayStats,
} from "./store";

const SHARE_PDF_FILENAME_PREFIX = "codex-wrapped-full";
const SHARE_PDF_RENDER_TIMEOUT_MS = 60_000;
const SHARE_PDF_VIRTUAL_TIME_BUDGET_MS = 15_000;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3210;
const SSE_PING_MS = 20_000;

let isScanning = false;
let lastScanAt: string | null = null;
let scanIntervalId: ReturnType<typeof setInterval> | null = null;
let activeServer: Bun.Server<unknown> | null = null;

type EventName = "sessionsUpdated" | "scanStarted" | "scanCompleted" | "navigate" | "themeChanged";

interface SseClient {
  send: (event: EventName, payload: unknown) => void;
  close: () => void;
}

const sseClients = new Set<SseClient>();

const toJsonResponse = (value: unknown, status = 200): Response =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });

const readJsonBody = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
};

const addDayStats = (target: DayStats, source: DayStats): void => {
  target.sessions += source.sessions;
  target.messages += source.messages;
  target.toolCalls += source.toolCalls;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.costUsd += source.costUsd;
  target.durationMs += source.durationMs;
};

const toTokenUsage = (stats: DayStats): TokenUsage => ({
  inputTokens: stats.inputTokens,
  outputTokens: stats.outputTokens,
  cacheReadTokens: stats.cacheReadTokens,
  cacheWriteTokens: stats.cacheWriteTokens,
  reasoningTokens: stats.reasoningTokens,
});

const createEmptyByAgent = (): DashboardSummary["byAgent"] => ({
  codex: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
});

const isInDateRange = (date: string, dateFrom?: string, dateTo?: string): boolean => {
  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;
  return true;
};

const getDailyTimelineFromStore = async (
  dateFrom: string,
  dateTo: string,
  source?: SessionSource,
  model?: string,
): Promise<DailyAggregate[]> => {
  const daily = await readDailyStore();
  const dates = Object.keys(daily).sort((a, b) => a.localeCompare(b));

  const rows = dates
    .filter((date) => isInDateRange(date, dateFrom, dateTo))
    .map((date) => {
      const entry = daily[date];
      if (!entry) return null;

      const stats = source ? entry.bySource[source] : model ? entry.byModel[model] : entry.totals;
      if (!stats) return null;

      return {
        date,
        source: source ?? "all",
        model: model ?? "all",
        sessionCount: stats.sessions,
        messageCount: stats.messages,
        toolCallCount: stats.toolCalls,
        tokens: toTokenUsage(stats),
        costUsd: stats.costUsd,
        totalDurationMs: stats.durationMs,
      } satisfies DailyAggregate;
    })
    .filter((row): row is DailyAggregate => row !== null);

  return rows;
};

const getDashboardSummaryFromStore = async (
  dateFrom?: string,
  dateTo?: string,
): Promise<DashboardSummary> => {
  const daily = await readDailyStore();
  const byAgent = createEmptyByAgent();
  const byModelMap = new Map<string, DayStats>();
  const byRepoMap = new Map<string, DayStats>();
  const byHourMap = new Map<number, DayStats>();
  const byHourSourceMap = new Map<number, Map<string, DayStats>>();
  const totals = createEmptyDayStats();

  for (const date of Object.keys(daily)) {
    if (!isInDateRange(date, dateFrom, dateTo)) continue;
    const entry = daily[date];
    if (!entry) continue;

    addDayStats(totals, entry.totals);

    for (const source of SESSION_SOURCES) {
      const stats = entry.bySource[source];
      if (!stats) continue;

      const target = byAgent[source];
      target.sessions += stats.sessions;
      target.events += stats.messages + stats.toolCalls;
      target.tokens.inputTokens += stats.inputTokens;
      target.tokens.outputTokens += stats.outputTokens;
      target.tokens.cacheReadTokens += stats.cacheReadTokens;
      target.tokens.cacheWriteTokens += stats.cacheWriteTokens;
      target.tokens.reasoningTokens += stats.reasoningTokens;
      target.costUsd += stats.costUsd;
    }

    for (const [model, modelStats] of Object.entries(entry.byModel)) {
      if (!byModelMap.has(model)) {
        byModelMap.set(model, createEmptyDayStats());
      }
      addDayStats(byModelMap.get(model) as DayStats, modelStats);
    }

    for (const [repo, repoStats] of Object.entries(entry.byRepo)) {
      if (!byRepoMap.has(repo)) {
        byRepoMap.set(repo, createEmptyDayStats());
      }
      addDayStats(byRepoMap.get(repo) as DayStats, repoStats);
    }

    for (const [hour, hourStats] of Object.entries(entry.byHour)) {
      const hourNum = Number(hour);
      if (!byHourMap.has(hourNum)) {
        byHourMap.set(hourNum, createEmptyDayStats());
      }
      addDayStats(byHourMap.get(hourNum) as DayStats, hourStats);
    }

    for (const [hour, sources] of Object.entries(entry.byHourSource)) {
      const hourNum = Number(hour);
      if (!byHourSourceMap.has(hourNum)) {
        byHourSourceMap.set(hourNum, new Map());
      }
      const sourceMap = byHourSourceMap.get(hourNum) as Map<string, DayStats>;
      for (const [source, sourceStats] of Object.entries(sources)) {
        if (!sourceMap.has(source)) {
          sourceMap.set(source, createEmptyDayStats());
        }
        addDayStats(sourceMap.get(source) as DayStats, sourceStats);
      }
    }
  }

  const byModel = [...byModelMap.entries()]
    .map(([model, stats]) => ({
      model,
      sessions: stats.sessions,
      tokens: toTokenUsage(stats),
      costUsd: stats.costUsd,
    }))
    .sort((left, right) => {
      if (right.sessions !== left.sessions) return right.sessions - left.sessions;
      return right.costUsd - left.costUsd;
    })
    .slice(0, 100);

  const dailyTimeline = dateFrom && dateTo ? await getDailyTimelineFromStore(dateFrom, dateTo) : [];
  const topRepos = buildTopRepos(byRepoMap);

  const hourlyBreakdown: HourlyBreakdownEntry[] = Array.from({ length: 24 }, (_, hour) => {
    const stats = byHourMap.get(hour) ?? createEmptyDayStats();
    const sourceMap = byHourSourceMap.get(hour);
    const byHourAgent = sourceMap
      ? SESSION_SOURCES.filter((source) => sourceMap.has(source))
          .map((source) => {
            const s = sourceMap.get(source) as DayStats;
            return {
              source,
              sessions: s.sessions,
              tokens: toTokenUsage(s),
              costUsd: s.costUsd,
            };
          })
          .sort((a, b) => {
            const aTot = a.tokens.inputTokens + a.tokens.outputTokens;
            const bTot = b.tokens.inputTokens + b.tokens.outputTokens;
            return bTot - aTot;
          })
      : [];
    return {
      hour,
      sessions: stats.sessions,
      tokens: toTokenUsage(stats),
      costUsd: stats.costUsd,
      durationMs: stats.durationMs,
      byAgent: byHourAgent,
    };
  });

  return {
    totals: {
      sessions: totals.sessions,
      events: totals.messages + totals.toolCalls,
      messages: totals.messages,
      toolCalls: totals.toolCalls,
      tokens: toTokenUsage(totals),
      costUsd: totals.costUsd,
      durationMs: totals.durationMs,
    },
    byAgent,
    byModel,
    dailyTimeline,
    topRepos,
    topTools: [],
    hourlyBreakdown,
  };
};

const dailyStoreNeedsRepoBackfill = async (): Promise<boolean> => {
  const daily = await readDailyStore();
  let hasActivity = false;

  for (const entry of Object.values(daily)) {
    if (hasTrackedActivity(entry.totals)) {
      hasActivity = true;
      break;
    }
  }

  if (!hasActivity) {
    return false;
  }

  return dailyStoreMissingRepoDimension();
};

const getSessionCountFromStore = async (): Promise<number> => {
  const daily = await readDailyStore();
  let count = 0;
  for (const entry of Object.values(daily)) {
    count += entry.totals.sessions;
  }
  return count;
};

const getTrayStatsFromStore = async (): Promise<TrayStats> => {
  const today = toLocalISODate(new Date());
  const daily = await readDailyStore();
  const todayStats = daily[today]?.totals ?? createEmptyDayStats();

  return {
    todayTokens:
      todayStats.inputTokens +
      todayStats.outputTokens +
      todayStats.cacheReadTokens +
      todayStats.cacheWriteTokens +
      todayStats.reasoningTokens,
    todayCost: todayStats.costUsd,
    todaySessions: todayStats.sessions,
    todayEvents: todayStats.messages + todayStats.toolCalls,
    activeSessions: 0,
  };
};

interface HeadlessBrowserCandidate {
  label: string;
  command: string;
}

const isAbsoluteCommandPath = (command: string): boolean =>
  command.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(command);

const resolveHeadlessBrowserCandidates = (): HeadlessBrowserCandidate[] => {
  if (process.platform === "darwin") {
    return [
      {
        label: "Google Chrome",
        command: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      },
      {
        label: "Chromium",
        command: "/Applications/Chromium.app/Contents/MacOS/Chromium",
      },
      {
        label: "Microsoft Edge",
        command: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      },
      {
        label: "Brave Browser",
        command: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      },
    ];
  }

  if (process.platform === "win32") {
    const programFiles = process.env.PROGRAMFILES ?? "C:\\Program Files";
    const programFilesX86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
    const localAppData = process.env.LOCALAPPDATA ?? "";

    return [
      {
        label: "Google Chrome",
        command: join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      },
      {
        label: "Google Chrome (x86)",
        command: join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      },
      {
        label: "Chromium",
        command: join(localAppData, "Chromium", "Application", "chrome.exe"),
      },
      {
        label: "Microsoft Edge",
        command: join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      },
      {
        label: "Microsoft Edge (x86)",
        command: join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      },
      {
        label: "Brave Browser",
        command: join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      },
    ];
  }

  return [
    { label: "Google Chrome", command: "google-chrome-stable" },
    { label: "Google Chrome", command: "google-chrome" },
    { label: "Chromium", command: "chromium-browser" },
    { label: "Chromium", command: "chromium" },
    { label: "Microsoft Edge", command: "microsoft-edge" },
    { label: "Brave Browser", command: "brave-browser" },
  ];
};

const buildSharePdfOutputPath = async (): Promise<string> => {
  const downloadsDir = join(homedir(), "Downloads");
  await mkdir(downloadsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (let index = 0; index < 200; index += 1) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const filename = `${SHARE_PDF_FILENAME_PREFIX}-${timestamp}${suffix}.pdf`;
    const candidatePath = join(downloadsDir, filename);
    if (!existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error("Failed to allocate a PDF filename in Downloads.");
};

const readStderr = async (stream: ReadableStream<Uint8Array> | null): Promise<string> => {
  if (!stream) return "";
  try {
    return (await new Response(stream).text()).trim();
  } catch {
    return "";
  }
};

const tryRenderSharePdfWithBrowser = async (
  candidate: HeadlessBrowserCandidate,
  outputPath: string,
  shareUrl: string,
  userDataDir: string,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  const args = [
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--run-all-compositor-stages-before-draw",
    `--user-data-dir=${userDataDir}`,
    `--virtual-time-budget=${SHARE_PDF_VIRTUAL_TIME_BUDGET_MS}`,
    "--print-to-pdf-no-header",
    `--print-to-pdf=${outputPath}`,
    shareUrl,
  ];

  if (process.platform === "linux") {
    args.splice(2, 0, "--no-sandbox");
  }

  let processRef: Bun.Subprocess<"ignore", "ignore", "pipe">;
  try {
    processRef = Bun.spawn([candidate.command, ...args], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: message };
  }

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    try {
      processRef.kill();
    } catch {
      // no-op
    }
  }, SHARE_PDF_RENDER_TIMEOUT_MS);

  const [exitCode, stderrText] = await Promise.all([processRef.exited, readStderr(processRef.stderr)]);
  clearTimeout(timeoutId);

  if (timedOut) {
    return { ok: false, reason: "Timed out while rendering PDF." };
  }
  if (exitCode !== 0) {
    return {
      ok: false,
      reason: stderrText.length > 0 ? `Exited with code ${exitCode}: ${stderrText}` : `Exited with code ${exitCode}.`,
    };
  }

  try {
    const outputStat = await stat(outputPath);
    if (!outputStat.isFile() || outputStat.size <= 0) {
      return { ok: false, reason: "Generated PDF file is empty." };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: message };
  }

  return { ok: true };
};

const exportFullSharePdf = async (url: string): Promise<{ path: string; browser: string }> => {
  const resolvedUrl = tryResolveAllowedExternalUrl(url);
  if (!resolvedUrl || !resolvedUrl.startsWith("http")) {
    throw new Error("Rejected PDF export for invalid share URL.");
  }

  const parsed = new URL(resolvedUrl);
  const isSharePath = parsed.pathname === "/share" || parsed.pathname === "/share/";
  if (!isSharePath) {
    throw new Error("PDF export only supports codex-wrapped.com/share URLs.");
  }

  const outputPath = await buildSharePdfOutputPath();
  const candidates = resolveHeadlessBrowserCandidates().filter((candidate) => {
    if (!isAbsoluteCommandPath(candidate.command)) return true;
    return existsSync(candidate.command);
  });

  if (candidates.length === 0) {
    throw new Error(
      "No supported browser found for automatic PDF export. Install Chrome, Chromium, Edge, or Brave.",
    );
  }

  let lastFailure = "";
  const userDataDir = await mkdtemp(join(tmpdir(), "codex-wrapped-pdf-"));

  try {
    for (const candidate of candidates) {
      try {
        await rm(outputPath, { force: true });
      } catch {
        // no-op
      }
      const attempt = await tryRenderSharePdfWithBrowser(candidate, outputPath, resolvedUrl, userDataDir);
      if (attempt.ok) {
        return {
          path: outputPath,
          browser: candidate.label,
        };
      }
      lastFailure = `${candidate.label}: ${attempt.reason}`;
    }
  } finally {
    try {
      await rm(userDataDir, { recursive: true, force: true });
    } catch {
      // no-op
    }
  }

  if (lastFailure.length > 0) {
    throw new Error(`Automatic PDF export failed. ${lastFailure}`);
  }
  throw new Error("Automatic PDF export failed.");
};

const updateSettings = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
  const current = await getSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    customPaths: {
      ...current.customPaths,
      ...(patch.customPaths ?? {}),
    },
  };
  await setSettings(next);
  return next;
};

const emitEvent = (event: EventName, payload: unknown): void => {
  for (const client of [...sseClients]) {
    try {
      client.send(event, payload);
    } catch (error) {
      console.warn(`[sse] Failed to send ${event}`, error);
      try {
        client.close();
      } catch {
        sseClients.delete(client);
      }
    }
  }
};

const runScanWithNotifications = async (fullScan = false) => {
  if (isScanning) {
    return { scanned: 0, total: 0, errors: 0 };
  }

  isScanning = true;

  try {
    emitEvent("scanStarted", {});
    const aggregationTimeZone = resolveAggregationTimeZone();
    const effectiveFullScan =
      fullScan || (await dailyStoreNeedsRepoBackfill()) || (await dailyStoreMissingHourDimension());
    const result = await runScan({ fullScan: effectiveFullScan, timeZone: aggregationTimeZone });
    lastScanAt = new Date().toISOString();

    emitEvent("scanCompleted", { scanned: result.scanned, total: result.total });
    emitEvent("sessionsUpdated", {
      scanResult: {
        scanned: result.scanned,
        total: result.total,
      },
    });

    return result;
  } catch (error) {
    console.error("[scan] Failed", error);
    return { scanned: 0, total: 0, errors: 1 };
  } finally {
    isScanning = false;
  }
};

const configureBackgroundScan = (intervalMinutes: number) => {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }

  const safeMinutes = Number.isFinite(intervalMinutes) ? Math.max(1, Math.floor(intervalMinutes)) : 5;
  scanIntervalId = setInterval(() => {
    void runScanWithNotifications(false);
  }, safeMinutes * 60_000);
};

const openExternalUrl = (url: string): void => {
  try {
    const command = getOpenExternalCommand(url);
    const process = Bun.spawn(command, {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    void process.exited;
  } catch (error) {
    console.warn(`[rpc] Failed to open URL: ${url}`, error);
  }
};

const resolveMime = (path: string): string | null => {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".ico")) return "image/x-icon";
  return null;
};

const serveStatic = async (request: Request, staticDir: string): Promise<Response> => {
  const url = new URL(request.url);
  const hasExt = url.pathname.split("/").pop()?.includes(".") ?? false;
  const relativePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const filePath = join(staticDir, relativePath);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    const mime = resolveMime(filePath);
    return new Response(file, mime ? { headers: { "Content-Type": mime } } : undefined);
  }

  if (!hasExt) {
    const indexFile = Bun.file(join(staticDir, "index.html"));
    if (await indexFile.exists()) {
      return new Response(indexFile, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
  }

  return new Response("Not found", { status: 404 });
};

const createSseResponse = (): Response => {
  const encoder = new TextEncoder();
  let pingId: ReturnType<typeof setInterval> | null = null;
  let clientRef: SseClient | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: EventName, payload: unknown) => {
        const body = `event: ${event}\ndata: ${JSON.stringify(payload ?? {})}\n\n`;
        controller.enqueue(encoder.encode(body));
      };

      controller.enqueue(encoder.encode(": connected\n\n"));
      pingId = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, SSE_PING_MS);

      const client: SseClient = {
        send,
        close: () => {
          if (pingId) clearInterval(pingId);
          pingId = null;
          sseClients.delete(client);
        },
      };
      clientRef = client;
      sseClients.add(client);
    },
    cancel() {
      if (clientRef) {
        clientRef.close();
        clientRef = null;
      } else if (pingId) {
        clearInterval(pingId);
        pingId = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};

const handleApi = async (request: Request): Promise<Response> => {
  const { pathname } = new URL(request.url);

  if (request.method === "GET" && pathname === "/api/events") {
    return createSseResponse();
  }

  if (request.method === "POST" && pathname === "/api/getDashboardSummary") {
    const payload = await readJsonBody<{ dateFrom?: string; dateTo?: string }>(request);
    return toJsonResponse(await getDashboardSummaryFromStore(payload.dateFrom, payload.dateTo));
  }
  if (request.method === "POST" && pathname === "/api/getDailyTimeline") {
    const payload = await readJsonBody<{
      dateFrom: string;
      dateTo: string;
      source?: SessionSource;
      model?: string;
    }>(request);
    return toJsonResponse(
      await getDailyTimelineFromStore(payload.dateFrom, payload.dateTo, payload.source, payload.model),
    );
  }
  if (request.method === "POST" && pathname === "/api/triggerScan") {
    const payload = await readJsonBody<{ fullScan?: boolean }>(request);
    const result = await runScanWithNotifications(Boolean(payload.fullScan));
    return toJsonResponse({ scanned: result.scanned, total: result.total });
  }
  if (request.method === "GET" && pathname === "/api/getScanStatus") {
    return toJsonResponse({
      isScanning,
      lastScanAt,
      sessionCount: await getSessionCountFromStore(),
    });
  }
  if (request.method === "GET" && pathname === "/api/getTrayStats") {
    return toJsonResponse(await getTrayStatsFromStore());
  }
  if (request.method === "GET" && pathname === "/api/getSettings") {
    return toJsonResponse(await getSettings());
  }
  if (request.method === "POST" && pathname === "/api/exportFullSharePdf") {
    const payload = await readJsonBody<{ url: string }>(request);
    const resolved = tryResolveAllowedExternalUrl(payload.url);
    if (!resolved) {
      return toJsonResponse({ error: "Rejected PDF export for invalid URL." }, 400);
    }
    return toJsonResponse(await exportFullSharePdf(resolved));
  }
  if (request.method === "POST" && pathname === "/api/updateSettings") {
    const payload = await readJsonBody<Partial<AppSettings>>(request);
    const next = await updateSettings(payload);
    configureBackgroundScan(next.scanIntervalMinutes);
    emitEvent("themeChanged", { theme: next.theme });
    return toJsonResponse(true);
  }
  if (request.method === "POST" && pathname === "/api/openExternal") {
    const payload = await readJsonBody<{ url: string }>(request);
    const resolved = tryResolveAllowedExternalUrl(payload.url);
    if (!resolved) {
      return toJsonResponse({ error: "Rejected openExternal for invalid URL." }, 400);
    }
    openExternalUrl(resolved);
    return toJsonResponse({ ok: true });
  }
  if (request.method === "POST" && pathname === "/api/log") {
    const payload = await readJsonBody<{ msg?: string; level?: "info" | "warn" | "error" }>(request);
    const msg = typeof payload.msg === "string" ? payload.msg : "";
    if (payload.level === "warn") console.warn(`[webview] ${msg}`);
    else if (payload.level === "error") console.error(`[webview] ${msg}`);
    else console.info(`[webview] ${msg}`);
    return toJsonResponse({ ok: true });
  }

  return new Response("Not found", { status: 404 });
};

const proxyToVite = (request: Request, targetBaseUrl: string): Promise<Response> => {
  const source = new URL(request.url);
  const targetUrl = new URL(source.pathname + source.search, targetBaseUrl);
  return fetch(
    new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    }),
  );
};

export interface StartWebServerOptions {
  host?: string;
  port?: number;
  openBrowser?: boolean;
  staticDir?: string;
  runScanOnLaunch?: boolean;
  enableBackgroundScan?: boolean;
}

export const startWebServer = async (
  options: StartWebServerOptions = {},
): Promise<Bun.Server<unknown>> => {
  const host = options.host ?? DEFAULT_HOST;
  const port = Number.isFinite(options.port) ? (options.port as number) : Number(Bun.env.PORT ?? DEFAULT_PORT);
  const staticDir = options.staticDir ?? join(import.meta.dir, "..", "..", "dist");
  const viteUrl = Bun.env.VITE_DEV_SERVER_URL;

  if (!viteUrl && !existsSync(join(staticDir, "index.html"))) {
    throw new Error(
      `Missing ${join(staticDir, "index.html")}. Run "bun run build" before launching the web app.`,
    );
  }

  const server = Bun.serve({
    hostname: host,
    port,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        try {
          return await handleApi(request);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Internal server error";
          return toJsonResponse({ error: message }, 500);
        }
      }

      if (viteUrl && viteUrl.trim().length > 0) {
        return proxyToVite(request, viteUrl);
      }

      return serveStatic(request, staticDir);
    },
  });

  activeServer = server;
  const baseUrl = `http://${host}:${server.port}`;
  console.log(`[codex-wrapped] Web app running at ${baseUrl}`);

  if (options.openBrowser ?? true) {
    openExternalUrl(baseUrl);
  }

  const initialSettings = await getSettings();
  if (options.enableBackgroundScan ?? true) {
    configureBackgroundScan(initialSettings.scanIntervalMinutes);
  }
  emitEvent("themeChanged", { theme: initialSettings.theme });

  if ((options.runScanOnLaunch ?? initialSettings.scanOnLaunch) === true) {
    void runScanWithNotifications(false);
  }

  return server;
};

const stopServer = () => {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
  for (const client of sseClients) {
    client.close();
  }
  sseClients.clear();
  if (activeServer) {
    activeServer.stop(true);
    activeServer = null;
  }
};

process.on("SIGINT", stopServer);
process.on("SIGTERM", stopServer);
process.on("exit", stopServer);

if (import.meta.main) {
  void startWebServer();
}
