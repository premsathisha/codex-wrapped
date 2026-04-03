import { existsSync } from "node:fs";

export const run = (cmd: string[], step: string): void => {
	console.log(`\n[git-checks] ${step}`);
	console.log(`[git-checks] $ ${cmd.join(" ")}`);
	const result = Bun.spawnSync(cmd, {
		stdout: "inherit",
		stderr: "inherit",
	});

	if (result.exitCode !== 0) {
		throw new Error(`${step} failed with exit code ${result.exitCode}.`);
	}
};

export const getStagedFiles = (): string[] => {
	return getGitFileList(["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
};

const getGitFileList = (cmd: string[]): string[] => {
	const result = Bun.spawnSync(cmd, {
		stdout: "pipe",
		stderr: "inherit",
	});

	if (result.exitCode !== 0) {
		throw new Error(`Unable to run "${cmd.join(" ")}".`);
	}

	return new TextDecoder()
		.decode(result.stdout)
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
};

export const getWorkingTreeFiles = (): string[] => {
	const modified = getGitFileList(["git", "diff", "--name-only", "--diff-filter=ACMR", "HEAD"]);
	const untracked = getGitFileList(["git", "ls-files", "--others", "--exclude-standard"]);
	return [...new Set([...modified, ...untracked])].sort((left, right) => left.localeCompare(right));
};

export const getFilesSinceUpstream = (): string[] => {
	const upstreamResult = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const hasUpstream = upstreamResult.exitCode === 0;

	if (!hasUpstream) {
		return getWorkingTreeFiles();
	}

	const mergeBaseResult = Bun.spawnSync(["git", "merge-base", "HEAD", "@{upstream}"], {
		stdout: "pipe",
		stderr: "inherit",
	});
	if (mergeBaseResult.exitCode !== 0) {
		throw new Error("Unable to determine merge-base for pre-push checks.");
	}

	const base = new TextDecoder().decode(mergeBaseResult.stdout).trim();
	if (!base) {
		return getWorkingTreeFiles();
	}

	return getGitFileList(["git", "diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]);
};

const BIOME_EXTENSIONS = new Set([
	".cjs",
	".css",
	".cts",
	".html",
	".js",
	".json",
	".jsx",
	".mjs",
	".mts",
	".ts",
	".tsx",
]);

export const getBiomeEligibleFiles = (files: string[]): string[] =>
	files.filter((file) => {
		const dot = file.lastIndexOf(".");
		if (dot < 0) return false;
		return BIOME_EXTENSIONS.has(file.slice(dot));
	});

const OXLINT_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

export const getLintEligibleFiles = (files: string[]): string[] =>
	files.filter((file) => {
		const dot = file.lastIndexOf(".");
		if (dot < 0) return false;
		return OXLINT_EXTENSIONS.has(file.slice(dot));
	});

const TEST_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];

export const getFocusedTests = (files: string[]): string[] => {
	const tests = new Set<string>();

	for (const file of files) {
		if (!file.endsWith(".ts") && !file.endsWith(".tsx")) {
			continue;
		}

		if (TEST_SUFFIXES.some((suffix) => file.endsWith(suffix))) {
			tests.add(file);
			continue;
		}

		const extension = file.endsWith(".tsx") ? ".tsx" : ".ts";
		const base = file.slice(0, -extension.length);
		const candidates = [`${base}.test${extension}`, `${base}.spec${extension}`];

		for (const candidate of candidates) {
			if (existsSync(candidate)) {
				tests.add(candidate);
			}
		}
	}

	return [...tests].sort((left, right) => left.localeCompare(right));
};
