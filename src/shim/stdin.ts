export function stripBom(text: string): string {
	return text.replace(/^\uFEFF/, "");
}

export function parseJsonSafe(raw: string): Record<string, unknown> {
	const clean = stripBom(raw).trim();
	if (!clean) return {};
	try {
		return JSON.parse(clean);
	} catch {
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
