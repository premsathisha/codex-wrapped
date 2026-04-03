import { getBiomeEligibleFiles, getWorkingTreeFiles, run } from "./utils";

const inputFiles = process.argv.slice(2);
const candidateFiles = inputFiles.length > 0 ? inputFiles : getWorkingTreeFiles();
const files = getBiomeEligibleFiles(candidateFiles);

if (files.length === 0) {
	console.log("[git-checks] No files eligible for format checks.");
	process.exit(0);
}

run(["bun", "x", "biome", "check", "--linter-enabled=false", "--assist-enabled=false", ...files], "Format check");
