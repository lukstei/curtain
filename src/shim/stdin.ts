import { logDebug } from "../lib/logDebug.ts";
/** Strips leading UTF-8 Byte Order Mark (BOM) from stdin input. */
export const UTF8_BOM_REGEX = /^\uFEFF/;

export function stripBom(text: string): string {
	return text.replace(UTF8_BOM_REGEX, "");
}

export function parseJsonSafe(raw: string): Record<string, unknown> {
	const clean = stripBom(raw).trim();
	if (!clean) return {};
	try {
		return JSON.parse(clean);
	} catch (err) {
		logDebug("Failed to parse stdin payload", {
			error: err instanceof Error ? err.message : String(err),
			input: clean.slice(0, 200),
		});
		return {};
	}
}

export function readStdin(
	timeoutMs = 1000,
	stream: NodeJS.ReadableStream = process.stdin,
): Promise<string> {
	return new Promise((resolve) => {
		let buffer = "";
		let settled = false;

		function onData(chunk: Buffer | string) {
			if (settled) return;
			buffer += chunk.toString();
		}

		function done() {
			if (settled) return;
			settled = true;
			stream.removeListener("data", onData);
			stream.removeListener("end", done);
			stream.removeListener("error", done);
			clearTimeout(timer);
			resolve(stripBom(buffer));
		}

		stream.on("data", onData);
		stream.on("end", done);
		stream.on("error", done);

		const timer = setTimeout(done, timeoutMs);
		if (typeof timer.unref === "function") {
			timer.unref();
		}
	});
}
