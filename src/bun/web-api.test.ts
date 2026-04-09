import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { startWebServer } from "./index";
import { setDataDirOverrideForTests } from "./store";

test("web API endpoints expose dashboard and scan status contracts", async () => {
	const staticDir = await mkdtemp(join(tmpdir(), "codex-wrapped-web-static-"));
	const dataDir = await mkdtemp(join(tmpdir(), "codex-wrapped-web-data-"));
	const codexHome = await mkdtemp(join(tmpdir(), "codex-wrapped-web-codex-"));
	const previousCodexHome = process.env.CODEX_HOME;
	await writeFile(join(staticDir, "index.html"), "<!doctype html><title>ok</title>\n", "utf8");
	setDataDirOverrideForTests(dataDir);
	process.env.CODEX_HOME = codexHome;

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
			aggregationTimeZone: string;
			totals: { sessions: number; costUsd: number };
			byAgent: Record<string, unknown>;
		};
		expect(typeof summary.aggregationTimeZone).toBe("string");
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

		const triggerScanResponse = await fetch(`${baseUrl}/api/triggerScan`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ fullScan: false }),
		});
		expect(triggerScanResponse.status).toBe(200);
		const scanResult = (await triggerScanResponse.json()) as {
			scanned: number;
			total: number;
			started: boolean;
		};
		expect(typeof scanResult.scanned).toBe("number");
		expect(typeof scanResult.total).toBe("number");
		expect(typeof scanResult.started).toBe("boolean");
	} finally {
		server.stop(true);
		setDataDirOverrideForTests(null);
		if (typeof previousCodexHome === "string") {
			process.env.CODEX_HOME = previousCodexHome;
		} else {
			delete process.env.CODEX_HOME;
		}
	}
});
