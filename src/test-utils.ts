import * as path from "node:path";
import { TRAILING_SLASHES_REGEX } from "./regex.ts";

const defaultRepoRoot = path.resolve(import.meta.dirname, "..");

export function stripAbsolutePath<T>(input: T, root?: string): T {
	const resolvedRoot = typeof root === "string" ? root : defaultRepoRoot;
	const cleanRoot = resolvedRoot.replace(TRAILING_SLASHES_REGEX, "");
	const slashPrefix = `${cleanRoot.replaceAll("\\", "/")}/`;
	const backslashPrefix = `${cleanRoot.replaceAll("/", "\\")}\\`;

	function clean(str: string): string {
		return str.replaceAll(slashPrefix, "").replaceAll(backslashPrefix, "");
	}

	if (typeof input === "string") {
		return clean(input) as T;
	}

	if (Array.isArray(input)) {
		return input.map((item) => stripAbsolutePath(item, resolvedRoot)) as T;
	}

	if (input !== null && typeof input === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(input)) {
			result[key] = stripAbsolutePath(value, resolvedRoot);
		}
		return result as T;
	}

	return input;
}
