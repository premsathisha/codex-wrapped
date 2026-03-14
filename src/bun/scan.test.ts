import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface IsolatedScanResult {
  result: { scanned: number; total: number; errors: number };
  dailyExists: boolean;
  totalSessions: number;
}

const tempDirs: string[] = [];

const makeTempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

const runIsolatedScan = (homeDir: string, codexHome: string): IsolatedScanResult => {
  const script = `
const { runScan } = await import("./src/bun/scan.ts");
const result = await runScan({ fullScan: true, sources: ["codex"] });
const dailyPath = process.env.HOME + "/.codex-wrapped/daily.json";
const dailyFile = Bun.file(dailyPath);
const dailyExists = await dailyFile.exists();
let totalSessions = 0;
if (dailyExists) {
  const daily = JSON.parse(await dailyFile.text());
  for (const entry of Object.values(daily)) {
    const totals = (entry && typeof entry === "object") ? entry.totals : null;
    if (totals && typeof totals.sessions === "number") {
      totalSessions += totals.sessions;
    }
  }
}
console.log(JSON.stringify({ result, dailyExists, totalSessions }));
`;

  const command = Bun.spawnSync(["bun", "-e", script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: homeDir,
      CODEX_HOME: codexHome,
    },
  });

  expect(command.exitCode).toBe(0);
  const stdout = new TextDecoder().decode(command.stdout).trim();
  return JSON.parse(stdout) as IsolatedScanResult;
};

const writeGoodCodexSession = (filePath: string, sessionId: string) => {
  const goodContent = `${JSON.stringify({
    timestamp: "2026-03-12T00:00:00.000Z",
    type: "session_meta",
    payload: {
      id: sessionId,
      cwd: "/tmp/project",
      model_provider: "gpt-5",
    },
  })}\n`;
  writeFileSync(filePath, goodContent, "utf8");
};

const writeBadCodexSession = (filePath: string) => {
  writeFileSync(filePath, "{bad json\n", "utf8");
};

describe("runScan parse error resilience", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("persists partial rebuild when at least one session parses", () => {
    const homeDir = makeTempDir("codexwrapped-home-");
    const codexHome = makeTempDir("codexwrapped-codex-");

    const sessionsDir = join(codexHome, "sessions", "2026", "03", "12");
    mkdirSync(sessionsDir, { recursive: true });

    writeGoodCodexSession(join(sessionsDir, "rollout-2026-03-12T00-00-00-good.jsonl"), "session-good");
    writeBadCodexSession(join(sessionsDir, "rollout-2026-03-12T00-00-01-bad.jsonl"));

    const run = runIsolatedScan(homeDir, codexHome);
    expect(run.result.errors).toBe(1);
    expect(run.result.scanned).toBe(1);
    expect(run.dailyExists).toBe(true);
    expect(run.totalSessions).toBe(1);
  });

  test("keeps previous aggregates when all parses fail", () => {
    const homeDir = makeTempDir("codexwrapped-home-");
    const codexHome = makeTempDir("codexwrapped-codex-");

    const sessionsDir = join(codexHome, "sessions", "2026", "03", "12");
    mkdirSync(sessionsDir, { recursive: true });

    const sessionPath = join(sessionsDir, "rollout-2026-03-12T00-00-00-good.jsonl");
    writeGoodCodexSession(sessionPath, "session-initial");

    const first = runIsolatedScan(homeDir, codexHome);
    expect(first.dailyExists).toBe(true);
    expect(first.totalSessions).toBe(1);

    writeBadCodexSession(sessionPath);

    const second = runIsolatedScan(homeDir, codexHome);
    expect(second.result.errors).toBe(1);
    expect(second.result.scanned).toBe(0);
    expect(second.dailyExists).toBe(true);
    expect(second.totalSessions).toBe(1);
  });
});
