import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { startWebServer } from "./index";

test("web API endpoints expose dashboard and scan status contracts", async () => {
  const staticDir = await mkdtemp(join(tmpdir(), "codex-wrapped-web-static-"));
  await writeFile(join(staticDir, "index.html"), "<!doctype html><title>ok</title>\n", "utf8");

  const server = await startWebServer({
    host: "127.0.0.1",
    port: 0,
    openBrowser: false,
    staticDir,
    runScanOnLaunch: false,
    enableBackgroundScan: false,
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;

    const summaryResponse = await fetch(`${baseUrl}/api/getDashboardSummary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(summaryResponse.status).toBe(200);
    const summary = (await summaryResponse.json()) as {
      totals: { sessions: number; costUsd: number };
      byAgent: Record<string, unknown>;
    };
    expect(typeof summary.totals.sessions).toBe("number");
    expect(typeof summary.totals.costUsd).toBe("number");
    expect(typeof summary.byAgent).toBe("object");

    const scanStatusResponse = await fetch(`${baseUrl}/api/getScanStatus`);
    expect(scanStatusResponse.status).toBe(200);
    const status = (await scanStatusResponse.json()) as {
      isScanning: boolean;
      lastScanAt: string | null;
      sessionCount: number;
    };
    expect(typeof status.isScanning).toBe("boolean");
    expect(typeof status.sessionCount).toBe("number");
    expect(status.lastScanAt === null || typeof status.lastScanAt === "string").toBe(true);
  } finally {
    server.stop(true);
  }
});
