export type CurtainCommand =
	| { name: "next" }
	| { name: "drop" }
	| { name: "status" }
	| { name: "run"; path: string }
	| { name: "help" };

export interface ParseResult {
	isCurtainCommand: boolean;
	command?: CurtainCommand;
	error?: string;
}

function parseFilePath(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	const bracketMatch = trimmed.match(/^@\[([^\]]+)\]/);
	if (bracketMatch) return bracketMatch[1].trim();

	const quoteMatch = trimmed.match(/^["']([^"']+)["']/);
	if (quoteMatch) return quoteMatch[1].trim();

	const atMatch = trimmed.match(/^@(\S+)/);
	if (atMatch) return atMatch[1].trim();

	return trimmed.split(/\s+/)[0];
}

export function parseCommand(input?: string): ParseResult {
	if (!input) return { isCurtainCommand: false };
	const trimmed = input.trim();

	if (/^[/$]next$/i.test(trimmed)) {
		return { isCurtainCommand: true, command: { name: "next" } };
	}

	// Match /curtain, $curtain, $curtain:curtain followed by delimiters or end
	const match = trimmed.match(
		/^(?:\/curtain|\$curtain(?::curtain)?|\$curtain)(?:[:\s-]+(.*)|$)/i,
	);
	if (!match) {
		return { isCurtainCommand: false };
	}

	const rest = (match[1] ?? "").trim();
	if (!rest) {
		return { isCurtainCommand: true, command: { name: "status" } };
	}

	const tokens = rest.split(/\s+/);
	const sub = tokens[0].toLowerCase();

	if (sub === "next") {
		return { isCurtainCommand: true, command: { name: "next" } };
	}

	if (sub === "drop" || sub === "stop" || sub === "abort") {
		return { isCurtainCommand: true, command: { name: "drop" } };
	}

	if (sub === "status") {
		return { isCurtainCommand: true, command: { name: "status" } };
	}

	if (sub === "help") {
		return { isCurtainCommand: true, command: { name: "help" } };
	}

	if (sub === "run" || sub === "start") {
		const filePath = parseFilePath(rest.slice(sub.length));
		if (!filePath) {
			return {
				isCurtainCommand: true,
				error: "Missing required script path argument.",
			};
		}
		return { isCurtainCommand: true, command: { name: "run", path: filePath } };
	}

	// If argument looks like a path (e.g. /curtain playbook.md or /curtain @path)
	const filePath = parseFilePath(rest);
	if (filePath) {
		return { isCurtainCommand: true, command: { name: "run", path: filePath } };
	}

	return { isCurtainCommand: true, command: { name: "help" } };
}

export function getHelpText(): string {
	return [
		"Curtain Commands:",
		"  /curtain <file.md>      Start execution of a multi-act script",
		"  /next                   Advance to next step when paused at an intermission",
		"  /curtain drop           Stop execution and reset state",
		"  /curtain status         Display current step and runner status",
		"  /curtain help           Display this help message",
	].join("\n");
}
