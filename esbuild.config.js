import * as fs from "node:fs";
import esbuild from "esbuild";

await esbuild.build({
	entryPoints: ["src/cli.ts"],
	bundle: true,
	platform: "node",
	target: "node20",
	format: "esm",
	outfile: "dist/curtain.mjs",
	banner: { js: "#!/usr/bin/env node" },
	logLevel: "info",
});

fs.mkdirSync(".agents/plugins/curtain/dist", { recursive: true });
fs.copyFileSync("dist/curtain.mjs", ".agents/plugins/curtain/dist/curtain.mjs");
if (fs.existsSync("skills")) {
	fs.cpSync("skills", ".agents/plugins/curtain/skills", {
		recursive: true,
		force: true,
	});
}
if (fs.existsSync("rules")) {
	fs.cpSync("rules", ".agents/plugins/curtain/rules", {
		recursive: true,
		force: true,
	});
}
fs.copyFileSync("plugin.json", ".agents/plugins/curtain/plugin.json");
fs.copyFileSync("hooks.json", ".agents/plugins/curtain/hooks.json");
