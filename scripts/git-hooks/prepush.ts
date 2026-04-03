import { getBiomeEligibleFiles, getFilesSinceUpstream, getLintEligibleFiles, run } from "./utils";

const changedFiles = getFilesSinceUpstream();
const lintFiles = getLintEligibleFiles(changedFiles);
const formatFiles = getBiomeEligibleFiles(changedFiles);

run(["bun", "run", "typecheck"], "Typecheck");
if (lintFiles.length > 0) {
	run(["bun", "x", "oxlint", "--quiet", ...lintFiles], "Lint changed files");
} else {
	console.log("[git-checks] No changed files eligible for lint checks.");
}
if (formatFiles.length > 0) {
	run(
		["bun", "x", "biome", "check", "--linter-enabled=false", "--assist-enabled=false", ...formatFiles],
		"Format check changed files",
	);
} else {
	console.log("[git-checks] No changed files eligible for format checks.");
}
run(["bun", "test"], "Full test suite");

console.log("\n[git-checks] Pre-push checks passed.");
