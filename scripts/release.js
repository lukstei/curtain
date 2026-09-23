import { execSync } from "node:child_process";
import * as timers from "node:timers/promises";

const BUMP_TYPES = ["patch", "minor", "major"];
const DIST_FILES = [
	"dist/curtain.cjs",
	".agents/plugins/curtain/dist/curtain.cjs",
];

const bump = process.argv[2];
if (!BUMP_TYPES.includes(bump)) {
	console.error(`Usage: node scripts/release.js <${BUMP_TYPES.join("|")}>`);
	process.exit(1);
}

function run(cmd, options = {}) {
	return execSync(cmd, { stdio: "inherit", ...options });
}

function capture(cmd) {
	return execSync(cmd, { encoding: "utf-8" }).trim();
}

function restoreDistIndex() {
	try {
		run(`git update-index --assume-unchanged ${DIST_FILES.join(" ")}`, {
			stdio: "ignore",
		});
	} catch {}
}

function abort(message) {
	restoreDistIndex();
	console.error(`\nError: ${message}`);
	process.exit(1);
}

// 1. Pre-flight checks
console.log("→ Pre-flight: checking working tree status...");
const status = capture("git status --porcelain");
if (status.length > 0) {
	abort(
		"Working directory is not clean. Commit or stash changes before releasing.",
	);
}

const branch = capture("git branch --show-current");
if (branch !== "main") {
	abort(`Releases must be run from 'main' branch (currently on '${branch}').`);
}

console.log("→ Pre-flight: verifying sync with origin/main...");
run("git fetch origin main", { stdio: "ignore" });
const localHead = capture("git rev-parse HEAD");
const remoteHead = capture("git rev-parse origin/main");
if (localHead !== remoteHead) {
	abort(
		"Local 'main' is not in sync with 'origin/main'. Push local commits or pull remote changes first.",
	);
}

console.log("→ Pre-flight: running tests and typecheck...");
try {
	run("npm run verify");
} catch {
	abort("Verification failed (test or typecheck errors).");
}

// 2. Dispatch GitHub Actions workflow
console.log(`→ Dispatching GitHub Actions release (${bump})...`);
try {
	run(`gh workflow run publish.yml -f bump=${bump}`);
	await timers.setTimeout(2000);
} catch {
	abort("Failed to trigger GitHub Actions workflow.");
}

console.log("→ Watching release workflow run...");
try {
	run("gh run watch --exit-status");
} catch {
	abort("GitHub Actions release workflow failed or was cancelled.");
}

// 3. Post-release: clean dist and fast-forward pull
console.log(
	"→ Post-release: resetting local dist and pulling release commit...",
);
try {
	run(`git update-index --no-assume-unchanged ${DIST_FILES.join(" ")}`, {
		stdio: "ignore",
	});
	run(`git checkout HEAD -- ${DIST_FILES.join(" ")}`, {
		stdio: "ignore",
	});
	run("git pull --ff-only");
} catch {
	restoreDistIndex();
	console.error("\nFailed to pull release commit from origin/main.");
	process.exit(1);
}

// 4. Re-apply assume-unchanged on dist files
console.log("→ Re-applying assume-unchanged on dist artifacts...");
restoreDistIndex();

console.log(`\n✓ Successfully released ${bump} and synced local repository.`);
