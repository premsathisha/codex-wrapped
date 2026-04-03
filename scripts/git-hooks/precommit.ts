import { getBiomeEligibleFiles, getFocusedTests, getLintEligibleFiles, getStagedFiles, run } from "./utils";

const stagedFiles = getStagedFiles();
if (stagedFiles.length === 0) {
	console.log("[git-checks] No staged files detected. Skipping pre-commit checks.");
	process.exit(0);
}

run(["bun", "run", "typecheck"], "Typecheck");

const lintFiles = getLintEligibleFiles(stagedFiles);
if (lintFiles.length > 0) {
	run(["bun", "x", "oxlint", "--quiet", ...lintFiles], "Lint staged files");
} else {
	console.log("[git-checks] No staged files eligible for lint checks.");
}

const biomeFiles = getBiomeEligibleFiles(stagedFiles);
if (biomeFiles.length > 0) {
	run(
		["bun", "x", "biome", "check", "--linter-enabled=false", "--assist-enabled=false", ...biomeFiles],
		"Format check staged files",
	);
} else {
	console.log("[git-checks] No staged files eligible for format checks.");
}

const focusedTests = getFocusedTests(stagedFiles);
if (focusedTests.length > 0) {
	run(["bun", "test", ...focusedTests], "Focused tests for changed files");
} else {
	console.log("[git-checks] No focused tests mapped from staged files.");
}

console.log("\n[git-checks] Pre-commit checks passed.");
