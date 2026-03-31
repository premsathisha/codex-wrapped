import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { discoverCodex } from "./codex";

const tempDirs: string[] = [];

const makeTempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

const writeSessionFile = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "{}\n", "utf8");
};

describe("discoverCodex", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("discovers both active and archived session files under a codex root", async () => {
    const codexRoot = makeTempDir("codexwrapped-codex-root-");
    const activePath = join(codexRoot, "sessions", "2026", "03", "12", "rollout-active.jsonl");
    const archivedPath = join(codexRoot, "archived_sessions", "rollout-archived.jsonl");
    writeSessionFile(activePath);
    writeSessionFile(archivedPath);

    const candidates = await discoverCodex({ customPaths: { codex: codexRoot } });
    const paths = candidates.map((candidate) => candidate.path);

    expect(paths).toContain(activePath);
    expect(paths).toContain(archivedPath);
  });

  test("discovers archived sibling when custom codex path points to sessions directory", async () => {
    const codexRoot = makeTempDir("codexwrapped-codex-sessions-");
    const sessionsRoot = join(codexRoot, "sessions");
    const activePath = join(sessionsRoot, "2026", "03", "12", "rollout-active.jsonl");
    const archivedPath = join(codexRoot, "archived_sessions", "rollout-archived.jsonl");
    writeSessionFile(activePath);
    writeSessionFile(archivedPath);

    const candidates = await discoverCodex({ customPaths: { codex: sessionsRoot } });
    const paths = candidates.map((candidate) => candidate.path);

    expect(paths).toContain(activePath);
    expect(paths).toContain(archivedPath);
  });
});
