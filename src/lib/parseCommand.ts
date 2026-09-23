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

	// Match /curtain or $curtain followed by delimiters or end
	const match = trimmed.match(
		/^(?:\/curtain|\$curtain(?::curtain)?)(?:([:\s-]+)(.*)|$)/i,
	);
	if (!match) {
		return { isCurtainCommand: false };
	}

	const delim = match[1] ?? "";
	const rest = (match[2] ?? "").trim();

	// Bare /curtain or $curtain defaults to status
	if (!delim && !rest) {
		return { isCurtainCommand: true, command: { name: "status" } };
	}

	// Trailing hyphen with no command (e.g. /curtain-) is not a curtain command
	if (delim.startsWith("-") && !rest) {
		return { isCurtainCommand: false };
	}

	if (!rest) {
		return { isCurtainCommand: true, command: { name: "status" } };
	}

	const tokens = rest.split(/\s+/);
	const sub = tokens[0].toLowerCase();

	if (sub === "status") {
		return { isCurtainCommand: true, command: { name: "status" } };
	}

	if (sub === "stop" || sub === "drop" || sub === "abort") {
		return { isCurtainCommand: true, command: { name: "drop" } };
	}

	if (sub === "next") {
		return { isCurtainCommand: true, command: { name: "next" } };
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

	// Hyphenated prefix /curtain-<something> only applies to known subcommands above.
	// Arbitrary skill names like /curtain-test or /curtain-custom are not runner commands.
	if (delim.startsWith("-")) {
		return { isCurtainCommand: false };
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
		"  /curtain-run <file.md>   Start execution of a multi-act script",
		"  /curtain-status          Display current step and runner status",
		"  /curtain-stop            Stop execution and reset state",
		"  /next                    Advance to next step when paused at an intermission",
		"  /curtain-help            Display this help message",
	].join("\n");
}
