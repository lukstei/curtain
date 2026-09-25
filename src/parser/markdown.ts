/**
 * Based on https://github.com/croct-tech/md-lite-js
 * Copyright (c) Croct Tech - MIT License
 */

type MarkdownNodeMap = {
	text: {
		content: string;
	};
	heading: {
		depth: number;
		children: MarkdownNode[];
	};
	bold: {
		children: MarkdownNode;
	};
	italic: {
		children: MarkdownNode;
	};
	strike: {
		children: MarkdownNode;
	};
	code: {
		content: string;
	};
	codeblock: {
		language?: string;
		content: string;
	};
	blockquote: {
		children: MarkdownNode[];
	};
	link: {
		href: string;
		title?: string;
		children: MarkdownNode;
	};
	image: {
		src: string;
		alt: string;
	};
	paragraph: {
		children: MarkdownNode[];
	};
	fragment: {
		children: MarkdownNode[];
	};
};

export type MarkdownNodeType = keyof MarkdownNodeMap;

export type MarkdownNode<T extends MarkdownNodeType = MarkdownNodeType> = {
	[K in MarkdownNodeType]: MarkdownNodeMap[K] & {
		type: K;
		source: string;
	};
}[T];

export function parse(markdown: string): MarkdownNode {
	return MarkdownParser.parse(markdown);
}

class MismatchError extends Error {
	public constructor() {
		super("Mismatched token");

		Object.setPrototypeOf(this, MismatchError.prototype);
	}
}

class MarkdownParser {
	private readonly chars: string[];

	private index = 0;

	private static readonly NEWLINE = ["\r\n", "\r", "\n"];

	private static readonly NEW_PARAGRAPH = MarkdownParser.NEWLINE.flatMap(
		(prefix) => MarkdownParser.NEWLINE.map((suffix) => prefix + suffix),
	);

	private constructor(input: string) {
		this.chars = [...input];
	}

	public static parse(input: string): MarkdownNode {
		return new MarkdownParser(input).parseNext();
	}

	private parseNext(end = ""): MarkdownNode {
		const root: MarkdownNode<"fragment"> = {
			type: "fragment",
			children: [],
			source: "",
		};

		const startIndex = this.index;

		let text = "";
		let lastBlockIndex = 0;

		let paragraphStartIndex = this.index;
		let textStartIndex = this.index;

		const flushParagraph = (endIndex: number) => {
			if (text !== "") {
				const trimmedText = text.replace(/[\r\n]+$/, "");
				const trailingLen = text.length - trimmedText.length;
				const contentEndIndex = endIndex - trailingLen;
				if (trimmedText !== "") {
					root.children.push({
						type: "text",
						content: trimmedText,
						source: this.getSlice(textStartIndex, contentEndIndex),
					});
				}
				text = "";
				endIndex = contentEndIndex;
			}

			const inlineChildren = root.children.splice(lastBlockIndex);
			if (inlineChildren.length > 0) {
				const paragraph: MarkdownNode<"paragraph"> = {
					type: "paragraph",
					children: inlineChildren,
					source: this.getSlice(paragraphStartIndex, endIndex),
				};
				root.children.push(paragraph);
			}
			lastBlockIndex = root.children.length;
		};

		while (!this.done) {
			const escapedText = this.parseText("");

			if (escapedText !== "") {
				text += escapedText;

				continue;
			}

			if (
				end !== "" &&
				(this.matches(end) || this.matches(...MarkdownParser.NEWLINE))
			) {
				break;
			}

			const codeBlockMatch =
				end === "" && this.atLineStart() ? this.matchCodeBlockPrefix() : null;
			if (codeBlockMatch !== null) {
				flushParagraph(this.index);

				const node = this.parseCodeBlock(codeBlockMatch);
				root.children.push(node);
				lastBlockIndex = root.children.length;

				paragraphStartIndex = this.index;
				textStartIndex = this.index;

				continue;
			}

			const blockquoteMatch =
				end === "" && this.atLineStart() ? this.matchBlockquotePrefix() : false;
			if (blockquoteMatch) {
				flushParagraph(this.index);

				const node = this.parseBlockquote();
				root.children.push(node);
				lastBlockIndex = root.children.length;

				paragraphStartIndex = this.index;
				textStartIndex = this.index;

				continue;
			}

			const headingMatch =
				end === "" && this.atLineStart() ? this.matchHeadingPrefix() : null;
			if (headingMatch !== null) {
				flushParagraph(this.index);

				const headingStartIndex = this.index;
				this.advance(headingMatch.prefixLength);

				const inlines = this.parseNext("\n");
				const children =
					inlines.type === "fragment" ? inlines.children : [inlines];
				const headingEndIndex = this.index;

				this.stripTrailingHeadingHashes(children);

				while (MarkdownParser.NEWLINE.includes(this.current)) {
					this.advance();
				}

				root.children.push({
					type: "heading",
					depth: headingMatch.depth,
					children,
					source: this.getSlice(headingStartIndex, headingEndIndex),
				});
				lastBlockIndex = root.children.length;

				paragraphStartIndex = this.index;
				textStartIndex = this.index;

				continue;
			}

			if (this.matches(...MarkdownParser.NEW_PARAGRAPH)) {
				const paragraphEndIndex = this.index;

				while (MarkdownParser.NEWLINE.includes(this.current)) {
					this.advance();
				}

				flushParagraph(paragraphEndIndex);

				paragraphStartIndex = this.index;
				textStartIndex = this.index;

				continue;
			}

			const nodeStartIndex = this.index;

			let node: MarkdownNode | null = null;

			try {
				node = this.parseCurrent();
			} catch (error) {
				if (!(error instanceof MismatchError)) {
					/* istanbul ignore next */
					throw error;
				}
			}

			if (node === null) {
				this.seek(nodeStartIndex);

				text += this.current;

				this.advance();

				continue;
			}

			if (text !== "") {
				root.children.push({
					type: "text",
					content: text,
					source: this.getSlice(textStartIndex, nodeStartIndex),
				});
			}

			text = "";

			textStartIndex = this.index;

			root.children.push(node);
		}

		if (lastBlockIndex > 0) {
			flushParagraph(this.index);
		} else {
			if (text !== "") {
				root.children.push({
					type: "text",
					content: text,
					source: this.getSlice(textStartIndex, this.index),
				});
			}
		}

		if (root.children.length === 1) {
			return root.children[0];
		}

		root.source = this.getSlice(startIndex, this.index);

		return root;
	}

	private stripTrailingHeadingHashes(children: MarkdownNode[]): void {
		const last = children[children.length - 1];
		if (last?.type === "text") {
			last.content = last.content.replace(/\s+#+\s*$/, "");
			if (!last.content.trim()) {
				children.pop();
			}
		}
	}

	private parseCurrent(): MarkdownNode | null {
		const char = this.lookAhead();
		const startIndex = this.index;

		switch (char) {
			case "*":
			case "_": {
				const delimiter = this.matches("**") ? "**" : char;

				this.advance(delimiter.length);

				const children = this.parseNext(delimiter);

				this.match(delimiter);

				return {
					type: delimiter.length === 1 ? "italic" : "bold",
					children,
					source: this.getSlice(startIndex, this.index),
				};
			}

			case "~": {
				this.match("~~");

				const children = this.parseNext("~~");

				this.match("~~");

				return {
					type: "strike",
					children,
					source: this.getSlice(startIndex, this.index),
				};
			}

			case "`": {
				if (this.matches("```")) {
					return null;
				}

				const delimiter = this.matches("``") ? "``" : "`";

				this.match(delimiter);

				const content = this.parseText(delimiter).trim();

				if (this.matches("```")) {
					return null;
				}

				this.match(delimiter);

				return {
					type: "code",
					content,
					source: this.getSlice(startIndex, this.index),
				};
			}

			case "!": {
				this.advance();

				this.match("[");

				const alt = this.parseText("]");

				this.match("](");

				const src = this.parseText(")");

				this.match(")");

				return {
					type: "image",
					src,
					alt,
					source: this.getSlice(startIndex, this.index),
				};
			}

			case "[": {
				this.advance();

				const label = this.parseNext("]");

				this.match("](");

				const href = this.parseText(")", '"');

				let title: string | undefined;

				if (this.matches('"')) {
					this.match('"');

					title = this.parseText('"');

					this.match('"');
				}

				this.match(")");

				return {
					type: "link",
					href: href.trim(),
					...(title !== undefined ? { title } : {}),
					children: label,
					source: this.getSlice(startIndex, this.index),
				};
			}

			default:
				return null;
		}
	}

	private parseText(...end: string[]): string {
		let text = "";

		while (!this.done) {
			if (this.current === "\\" && this.index + 1 < this.length) {
				this.advance();

				text += this.current;

				this.advance();

				continue;
			}

			if (
				end.some((token) => token === "" || this.matches(token)) ||
				this.matches(...MarkdownParser.NEWLINE)
			) {
				break;
			}

			text += this.current;

			this.advance();
		}

		return text;
	}

	private atLineStart(): boolean {
		if (this.index === 0) return true;
		const prev = this.chars[this.index - 1];
		return prev === "\n" || prev === "\r";
	}

	private matchHeadingPrefix(): { depth: number; prefixLength: number } | null {
		if (!this.atLineStart()) return null;
		const slice = this.getSlice(this.index, this.index + 64);
		const match = slice.match(/^[ ]{0,3}(#{1,6})(?:[ \t]+|(?=[\r\n]|$))/);
		if (!match) return null;
		return { depth: match[1].length, prefixLength: match[0].length };
	}

	private getLineEnd(fromIndex: number): number {
		let i = fromIndex;
		while (
			i < this.length &&
			this.chars[i] !== "\n" &&
			this.chars[i] !== "\r"
		) {
			i++;
		}
		return i;
	}

	private getNewlineLength(index: number): number {
		if (index >= this.length) return 0;
		if (this.chars[index] === "\r" && this.chars[index + 1] === "\n") return 2;
		if (this.chars[index] === "\n" || this.chars[index] === "\r") return 1;
		return 0;
	}

	private matchCodeBlockPrefix(): {
		fenceChar: string;
		fenceLength: number;
		language?: string;
		openLineEnd: number;
	} | null {
		if (!this.atLineStart()) return null;

		let indent = 0;
		while (indent < 3 && this.chars[this.index + indent] === " ") {
			indent++;
		}
		const char = this.chars[this.index + indent];
		if (char !== "`" && char !== "~") return null;

		const openLineEnd = this.getLineEnd(this.index);
		const line = this.getSlice(this.index, openLineEnd);
		const match = line.match(/^[ ]{0,3}(`{3,}|~{3,})[ \t]*(\S*)/);
		if (!match) return null;

		const fence = match[1];
		const fenceChar = fence[0];
		if (fenceChar === "`" && line.slice(indent + fence.length).includes("`")) {
			return null;
		}

		return {
			fenceChar,
			fenceLength: fence.length,
			language: match[2] !== "" ? match[2] : undefined,
			openLineEnd,
		};
	}

	private parseCodeBlock(info: {
		fenceChar: string;
		fenceLength: number;
		language?: string;
		openLineEnd: number;
	}): MarkdownNode<"codeblock"> {
		const blockStartIndex = this.index;
		const openNewlineLen = this.getNewlineLength(info.openLineEnd);
		let cursor = info.openLineEnd + openNewlineLen;
		const contentStartIndex = cursor;

		const closingRegex = new RegExp(
			`^[ ]{0,3}\\${info.fenceChar}{${info.fenceLength},}[ \\t]*$`,
		);
		let contentEndIndex = this.length;
		let blockEndIndex = this.length;
		let closingFound = false;

		while (cursor < this.length) {
			const curLineEnd = this.getLineEnd(cursor);
			const curLine = this.getSlice(cursor, curLineEnd);
			if (closingRegex.test(curLine)) {
				closingFound = true;
				contentEndIndex = cursor;
				blockEndIndex = curLineEnd;
				cursor = curLineEnd + this.getNewlineLength(curLineEnd);
				break;
			}
			const nlLen = this.getNewlineLength(curLineEnd);
			if (nlLen === 0) {
				cursor = curLineEnd;
				break;
			}
			cursor = curLineEnd + nlLen;
		}

		if (!closingFound) {
			contentEndIndex = this.length;
			blockEndIndex = this.length;
		}

		this.seek(cursor);
		while (MarkdownParser.NEWLINE.includes(this.current)) {
			this.advance();
		}

		const content = this.getSlice(contentStartIndex, contentEndIndex);
		const source = this.getSlice(blockStartIndex, blockEndIndex);

		return {
			type: "codeblock",
			...(info.language !== undefined ? { language: info.language } : {}),
			content,
			source,
		};
	}

	private matchBlockquotePrefix(): boolean {
		if (!this.atLineStart()) return false;

		let indent = 0;
		while (indent < 3 && this.chars[this.index + indent] === " ") {
			indent++;
		}
		return this.chars[this.index + indent] === ">";
	}

	private parseBlockquote(): MarkdownNode<"blockquote"> {
		const blockquoteStartIndex = this.index;
		const innerLines: string[] = [];
		let cursor = this.index;
		let lastLineEnd = cursor;

		while (cursor < this.length) {
			let lineIndent = 0;
			while (lineIndent < 3 && this.chars[cursor + lineIndent] === " ") {
				lineIndent++;
			}
			if (this.chars[cursor + lineIndent] !== ">") {
				break;
			}

			const curLineEnd = this.getLineEnd(cursor);
			const rawLine = this.getSlice(cursor, curLineEnd);
			const strippedLine = rawLine.replace(/^[ ]{0,3}>[ \t]?/, "");
			innerLines.push(strippedLine);
			lastLineEnd = curLineEnd;

			const nlLen = this.getNewlineLength(curLineEnd);
			if (nlLen === 0) {
				cursor = curLineEnd;
				break;
			}
			cursor = curLineEnd + nlLen;
		}

		this.seek(cursor);
		while (MarkdownParser.NEWLINE.includes(this.current)) {
			this.advance();
		}

		const innerContent = innerLines.join("\n");
		let children: MarkdownNode[] = [];
		if (innerContent.trim() !== "") {
			const parsed = MarkdownParser.parse(innerContent);
			children = parsed.type === "fragment" ? parsed.children : [parsed];
		}
		const source = this.getSlice(blockquoteStartIndex, lastLineEnd);

		return {
			type: "blockquote",
			children,
			source,
		};
	}

	private get done(): boolean {
		return this.index >= this.length;
	}

	private get length(): number {
		return this.chars.length;
	}

	private get current(): string {
		return this.chars[this.index];
	}

	private advance(length = 1): void {
		this.index += length;
	}

	private seek(index: number): void {
		this.index = index;
	}

	private matches(...lookahead: string[]): boolean {
		return lookahead.some(
			(substring) => this.lookAhead(substring.length) === substring,
		);
	}

	private match(...lookahead: string[]): void {
		for (const substring of lookahead) {
			if (this.lookAhead(substring.length) === substring) {
				this.advance(substring.length);

				return;
			}
		}

		throw new MismatchError();
	}

	private lookAhead(length = 1): string {
		if (length === 1) {
			return this.current;
		}

		return this.getSlice(this.index, this.index + length);
	}

	private getSlice(start: number, end: number): string {
		return this.chars.slice(start, end).join("");
	}
}
