import * as fs from "node:fs";
import * as path from "node:path";

export interface CurtainConfig {
	debug?: boolean;
}

export function loadCurtainConfig(workspacePath?: string): CurtainConfig {
	const searchPaths: string[] = [];

	if (workspacePath) {
		searchPaths.push(path.join(workspacePath, "curtain.json"));
	}
	searchPaths.push(path.join(process.cwd(), "curtain.json"));

	// smell: search paths account for varying bundle nesting depths relative to import.meta.dirname
	searchPaths.push(path.resolve(import.meta.dirname, "..", "curtain.json"));
	searchPaths.push(path.resolve(import.meta.dirname, "../..", "curtain.json"));

	for (const configPath of searchPaths) {
		try {
			if (fs.existsSync(configPath)) {
				const content = fs.readFileSync(configPath, "utf-8");
				const parsed = JSON.parse(content) as Record<string, unknown>;
				if (typeof parsed === "object" && parsed !== null) {
					return {
						debug: Boolean(parsed.debug),
					};
				}
			}
		} catch {
			// Ignore read/parse errors and continue search
		}
	}

	return { debug: false };
}
