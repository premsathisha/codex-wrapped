#!/usr/bin/env bun

import { dirname, join } from "node:path";
import { getOpenExternalCommand } from "../src/bun/external";
import { startWebServer } from "../src/bun/index";

const PKG_ROOT = join(dirname(Bun.main), "..");
const HOME = Bun.env.HOME || Bun.env.USERPROFILE || "";

async function getPackageVersion(): Promise<string> {
  const pkg = await Bun.file(join(PKG_ROOT, "package.json")).json();
  return (pkg as { version: string }).version;
}

async function uninstallData(): Promise<void> {
  if (!HOME) return;
  if (process.platform === "win32") {
    await Bun.$`powershell -Command "Remove-Item -Recurse -Force '${HOME}/.ai-wrapped' -ErrorAction SilentlyContinue"`.quiet();
    return;
  }
  await Bun.$`rm -rf ${HOME}/.ai-wrapped`.quiet();
}

async function runBuild(): Promise<void> {
  const proc = Bun.spawn(["bun", "run", "build"], {
    cwd: PKG_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Build failed with exit code ${code}`);
  }
}

const openExternal = async (url: string): Promise<void> => {
  const proc = Bun.spawn(getOpenExternalCommand(url), {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Failed to open ${url}`);
  }
};

async function main() {
  const version = await getPackageVersion();

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Usage: ai-wrapped [options]\n");
    console.log("Options:");
    console.log("  --version, -v   Show package version");
    console.log("  --rebuild       Rebuild frontend assets before launch");
    console.log("  --uninstall     Remove ~/.ai-wrapped data");
    console.log("  --help, -h      Show this help");
    return;
  }

  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log(`ai-wrapped v${version}`);
    return;
  }

  if (process.argv.includes("--uninstall")) {
    console.log("Removing ~/.ai-wrapped...");
    await uninstallData();
    console.log("Done.");
    return;
  }

  if (process.argv.includes("--rebuild")) {
    console.log("Rebuilding frontend assets...");
    await runBuild();
  }

  await startWebServer();
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ai-wrapped] ${message}`);
  process.exit(1);
});
