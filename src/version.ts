import * as fs from "node:fs";
import * as path from "node:path";

export function getVersion(): string {
	try {
		const pkgPath = path.resolve(import.meta.dirname, "../package.json");
		if (fs.existsSync(pkgPath)) {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
			if (typeof pkg.version === "string") {
				return pkg.version;
			}
		}
	} catch {
		// Fallback if package.json cannot be read
	}
	return "0.1.3";
}
