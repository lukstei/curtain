import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const targetArg = process.argv[2];
if (!targetArg) {
	console.error("Usage: node scripts/dev-install.js <target-directory>");
	process.exit(1);
}

const targetDir = path.resolve(
	targetArg.replace(/^~(?=$|\/|\\)/, os.homedir()),
);

fs.mkdirSync(targetDir, { recursive: true });

const subdirs = fs
	.readdirSync(targetDir, { withFileTypes: true })
	.filter((d) => d.isDirectory() && /^\d+\./.test(d.name))
	.map((d) => path.join(targetDir, d.name));

const targetDirs = subdirs.length > 0 ? subdirs : [targetDir];

const files = [
	"dist",
	"hooks",
	"skills",
	"rules",
	".claude-plugin",
	".codex-plugin",
	".agents",
	"AGENTS.md",
	"README.md",
	"plugin.json",
	"hooks.json",
	"package.json",
];

for (const destDir of targetDirs) {
	for (const item of files) {
		if (fs.existsSync(item)) {
			const dest = path.join(destDir, item);
			fs.cpSync(item, dest, { recursive: true, force: true });
		}
	}
	console.log(`✓ Synced curtain plugin to: ${destDir}`);
}
