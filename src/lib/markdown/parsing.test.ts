import { describe, expect, it } from "vitest";
import type { MarkdownNode } from "./ast";
import { parse } from "./parsing";

describe("A Markdown parser function", () => {
	type ParsingScenario = {
		input: string;
		output: MarkdownNode;
	};

	it.each(
		Object.entries<ParsingScenario>({
			paragraphs: {
				input: "First paragraph.\n\nSecond paragraph.",
				output: {
					type: "fragment",
					source: "First paragraph.\n\nSecond paragraph.",
					children: [
						{
							type: "paragraph",
							source: "First paragraph.",
							children: [
								{
									type: "text",
									source: "First paragraph.",
									content: "First paragraph.",
								},
							],
						},
						{
							type: "paragraph",
							source: "Second paragraph.",
							children: [
								{
									type: "text",
									source: "Second paragraph.",
									content: "Second paragraph.",
								},
							],
						},
					],
				},
			},
			"paragraphs with different newlines": {
				input: "First\n\nSecond\r\rThird\r\n\r\nFourth",
				output: {
					type: "fragment",
					source: "First\n\nSecond\r\rThird\r\n\r\nFourth",
					children: [
						{
							type: "paragraph",
							source: "First",
							children: [
								{
									type: "text",
									source: "First",
									content: "First",
								},
							],
						},
						{
							type: "paragraph",
							source: "Second",
							children: [
								{
									type: "text",
									source: "Second",
									content: "Second",
								},
							],
						},
						{
							type: "paragraph",
							source: "Third",
							children: [
								{
									type: "text",
									source: "Third",
									content: "Third",
								},
							],
						},
						{
							type: "paragraph",
							source: "Fourth",
							children: [
								{
									type: "text",
									source: "Fourth",
									content: "Fourth",
								},
							],
						},
					],
				},
			},
			"paragraphs leading and trailing newlines": {
				input: "\n\n\r\nFirst paragraph.\n\n\r\nSecond paragraph.\n\n\r\n",
				output: {
					type: "fragment",
					source: "\n\n\r\nFirst paragraph.\n\n\r\nSecond paragraph.\n\n\r\n",
					children: [
						{
							type: "paragraph",
							source: "First paragraph.",
							children: [
								{
									type: "text",
									source: "First paragraph.",
									content: "First paragraph.",
								},
							],
						},
						{
							type: "paragraph",
							source: "Second paragraph.",
							children: [
								{
									type: "text",
									source: "Second paragraph.",
									content: "Second paragraph.",
								},
							],
						},
					],
				},
			},
			"empty paragraphs": {
				input: "\n\r\r\n",
				output: {
					type: "fragment",
					source: "\n\r\r\n",
					children: [],
				},
			},
			"paragraphs multiple newlines": {
				input: "\n\n\nFirst paragraph.\n\n\nSecond paragraph.\n\n\n\n",
				output: {
					type: "fragment",
					source: "\n\n\nFirst paragraph.\n\n\nSecond paragraph.\n\n\n\n",
					children: [
						{
							type: "paragraph",
							source: "First paragraph.",
							children: [
								{
									type: "text",
									source: "First paragraph.",
									content: "First paragraph.",
								},
							],
						},
						{
							type: "paragraph",
							source: "Second paragraph.",
							children: [
								{
									type: "text",
									source: "Second paragraph.",
									content: "Second paragraph.",
								},
							],
						},
					],
				},
			},
			"mixed paragraphs and text": {
				input: [
					"**First**\n_paragraph_",
					"[Second paragraph](ex)",
					"![Third paragraph](ex)",
					"Fourth paragraph",
				].join("\n\n"),
				output: {
					type: "fragment",
					source: [
						"**First**\n_paragraph_",
						"[Second paragraph](ex)",
						"![Third paragraph](ex)",
						"Fourth paragraph",
					].join("\n\n"),
					children: [
						{
							type: "paragraph",
							source: "**First**\n_paragraph_",
							children: [
								{
									type: "bold",
									source: "**First**",
									children: {
										type: "text",
										source: "First",
										content: "First",
									},
								},
								{
									type: "text",
									source: "\n",
									content: "\n",
								},
								{
									type: "italic",
									source: "_paragraph_",
									children: {
										type: "text",
										source: "paragraph",
										content: "paragraph",
									},
								},
							],
						},
						{
							type: "paragraph",
							source: "[Second paragraph](ex)",
							children: [
								{
									type: "link",
									source: "[Second paragraph](ex)",
									href: "ex",
									children: {
										type: "text",
										source: "Second paragraph",
										content: "Second paragraph",
									},
								},
							],
						},
						{
							type: "paragraph",
							source: "![Third paragraph](ex)",
							children: [
								{
									type: "image",
									source: "![Third paragraph](ex)",
									src: "ex",
									alt: "Third paragraph",
								},
							],
						},
						{
							type: "paragraph",
							source: "Fourth paragraph",
							children: [
								{
									type: "text",
									source: "Fourth paragraph",
									content: "Fourth paragraph",
								},
							],
						},
					],
				},
			},
			text: {
				input: "Hello, world!",
				output: {
					type: "text",
					source: "Hello, world!",
					content: "Hello, world!",
				},
			},
			bold: {
				input: "Hello, **world**!",
				output: {
					type: "fragment",
					source: "Hello, **world**!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "bold",
							source: "**world**",
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"bold with start delimited escaped": {
				input: "Hello, \\**world**!",
				output: {
					type: "fragment",
					source: "Hello, \\**world**!",
					children: [
						{
							type: "text",
							source: "Hello, \\*",
							content: "Hello, *",
						},
						{
							type: "italic",
							source: "*world*",
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "*!",
							content: "*!",
						},
					],
				},
			},
			"bold with end delimited escaped": {
				input: "Hello, **world\\**!",
				output: {
					type: "fragment",
					source: "Hello, **world\\**!",
					children: [
						{
							type: "text",
							source: "Hello, *",
							content: "Hello, *",
						},
						{
							type: "italic",
							source: "*world\\**",
							children: {
								type: "text",
								source: "world\\*",
								content: "world*",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"bold with escaped asterisk": {
				input: "Hello, **wor\\*\\*ld**!",
				output: {
					type: "fragment",
					source: "Hello, **wor\\*\\*ld**!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "bold",
							source: "**wor\\*\\*ld**",
							children: {
								type: "text",
								source: "wor\\*\\*ld",
								content: "wor**ld",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"bold with newline": {
				input: "Hello, **\nworld**!",
				output: {
					type: "text",
					source: "Hello, **\nworld**!",
					content: "Hello, **\nworld**!",
				},
			},
			"bold unbalanced": {
				input: "Hello, **world***!",
				output: {
					type: "fragment",
					source: "Hello, **world***!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "bold",
							source: "**world**",
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "*!",
							content: "*!",
						},
					],
				},
			},
			"italic (underscore)": {
				input: "Hello, _world_!",
				output: {
					type: "fragment",
					source: "Hello, _world_!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "italic",
							source: "_world_",
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"italic with start delimited escaped (underscore)": {
				input: "Hello, \\_world_!",
				output: {
					type: "text",
					source: "Hello, \\_world_!",
					content: "Hello, _world_!",
				},
			},
			"italic with end delimited escaped (underscore)": {
				input: "Hello, _world\\_!",
				output: {
					type: "text",
					source: "Hello, _world\\_!",
					content: "Hello, _world_!",
				},
			},
			"italic with escaped delimiter (underscore)": {
				input: "Hello, _wor\\_ld_!",
				output: {
					type: "fragment",
					source: "Hello, _wor\\_ld_!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "italic",
							source: "_wor\\_ld_",
							children: {
								type: "text",
								source: "wor\\_ld",
								content: "wor_ld",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"italic with newline (underscore)": {
				input: "Hello, _\nworld_!",
				output: {
					type: "text",
					source: "Hello, _\nworld_!",
					content: "Hello, _\nworld_!",
				},
			},
			"italic (asterisk)": {
				input: "Hello, *world*!",
				output: {
					type: "fragment",
					source: "Hello, *world*!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "italic",
							source: "*world*",
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"italic with start delimited escaped (asterisk)": {
				input: "Hello, \\*world*!",
				output: {
					type: "text",
					source: "Hello, \\*world*!",
					content: "Hello, *world*!",
				},
			},
			"italic with end delimited escaped (asterisk)": {
				input: "Hello, *world\\*!",
				output: {
					type: "text",
					source: "Hello, *world\\*!",
					content: "Hello, *world*!",
				},
			},
			"italic with escaped delimiter (asterisk)": {
				input: "Hello, *wor\\*ld*!",
				output: {
					type: "fragment",
					source: "Hello, *wor\\*ld*!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "italic",
							source: "*wor\\*ld*",
							children: {
								type: "text",
								source: "wor\\*ld",
								content: "wor*ld",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"italic with newline (asterisk)": {
				input: "Hello, *\nworld*!",
				output: {
					type: "text",
					source: "Hello, *\nworld*!",
					content: "Hello, *\nworld*!",
				},
			},
			"bold and italic": {
				input: "Hello, ***world***!",
				output: {
					type: "fragment",
					source: "Hello, ***world***!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "bold",
							source: "***world***",
							children: {
								type: "italic",
								source: "*world*",
								children: {
									type: "text",
									source: "world",
									content: "world",
								},
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			strike: {
				input: "Hello, ~~world~~!",
				output: {
					type: "fragment",
					source: "Hello, ~~world~~!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "strike",
							source: "~~world~~",
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"strike with start delimited escaped": {
				input: "Hello, \\~~world~~!",
				output: {
					type: "text",
					source: "Hello, \\~~world~~!",
					content: "Hello, ~~world~~!",
				},
			},
			"strike with end delimited escaped": {
				input: "Hello, ~~world\\~~!",
				output: {
					type: "text",
					source: "Hello, ~~world\\~~!",
					content: "Hello, ~~world~~!",
				},
			},
			"strike with escaped asterisk": {
				input: "Hello, ~~wor\\~\\~ld~~!",
				output: {
					type: "fragment",
					source: "Hello, ~~wor\\~\\~ld~~!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "strike",
							source: "~~wor\\~\\~ld~~",
							children: {
								type: "text",
								source: "wor\\~\\~ld",
								content: "wor~~ld",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"strike with newline": {
				input: "Hello, ~~\nworld~~!",
				output: {
					type: "text",
					source: "Hello, ~~\nworld~~!",
					content: "Hello, ~~\nworld~~!",
				},
			},
			"code (single backtick)": {
				input: "Hello, `world`!",
				output: {
					type: "fragment",
					source: "Hello, `world`!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "code",
							source: "`world`",
							content: "world",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"code with trailing and leading whitespace (single backtick)": {
				input: "Hello, ` world `!",
				output: {
					type: "fragment",
					source: "Hello, ` world `!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "code",
							source: "` world `",
							content: "world",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"code with start delimited escaped (single backtick)": {
				input: "Hello, \\`world`!",
				output: {
					type: "text",
					source: "Hello, \\`world`!",
					content: "Hello, `world`!",
				},
			},
			"code with end delimited escaped (single backtick)": {
				input: "Hello, `world\\`!",
				output: {
					type: "text",
					source: "Hello, `world\\`!",
					content: "Hello, `world`!",
				},
			},
			"code with escaped backtick (single backtick)": {
				input: "Hello, `wor\\`ld`!",
				output: {
					type: "fragment",
					source: "Hello, `wor\\`ld`!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "code",
							source: "`wor\\`ld`",
							content: "wor`ld",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"code (double backtick)": {
				input: "Hello, ``world``!",
				output: {
					type: "fragment",
					source: "Hello, ``world``!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "code",
							source: "``world``",
							content: "world",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"code with trailing and leading whitespace (double backtick)": {
				input: "Hello, `` world ``!",
				output: {
					type: "fragment",
					source: "Hello, `` world ``!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "code",
							source: "`` world ``",
							content: "world",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"code with start delimited escaped (double backtick)": {
				input: "Hello, \\``world``!",
				output: {
					type: "fragment",
					source: "Hello, \\``world``!",
					children: [
						{
							type: "text",
							source: "Hello, \\`",
							content: "Hello, `",
						},
						{
							type: "code",
							source: "`world`",
							content: "world",
						},
						{
							type: "text",
							source: "`!",
							content: "`!",
						},
					],
				},
			},
			"code with end delimited escaped (double backtick)": {
				input: "Hello, ``world\\``!",
				output: {
					type: "fragment",
					source: "Hello, ``world\\``!",
					children: [
						{
							type: "text",
							source: "Hello, `",
							content: "Hello, `",
						},
						{
							type: "code",
							source: "`world\\``",
							content: "world`",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"code with escaped backtick (double backtick)": {
				input: "Hello, ``wor\\`ld``!",
				output: {
					type: "fragment",
					source: "Hello, ``wor\\`ld``!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "code",
							source: "``wor\\`ld``",
							content: "wor`ld",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"code with unescaped backtick (double backtick)": {
				input: "Hello, ``wor`ld``!",
				output: {
					type: "fragment",
					source: "Hello, ``wor`ld``!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "code",
							source: "``wor`ld``",
							content: "wor`ld",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"code with newline": {
				input: "Hello, `\nworld`!",
				output: {
					type: "text",
					source: "Hello, `\nworld`!",
					content: "Hello, `\nworld`!",
				},
			},
			link: {
				input: "Hello, [world](image.png)!",
				output: {
					type: "fragment",
					source: "Hello, [world](image.png)!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "link",
							source: "[world](image.png)",
							href: "image.png",
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"link with spaces": {
				input: "Hello, [world]( image.png )!",
				output: {
					type: "fragment",
					source: "Hello, [world]( image.png )!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "link",
							source: "[world]( image.png )",
							href: "image.png",
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"fenced code (unsupported)": {
				input: "Hello, ```world```!",
				output: {
					type: "text",
					source: "Hello, ```world```!",
					content: "Hello, ```world```!",
				},
			},
			"fenced code unbalanced (unsupported)": {
				input: "Hello, ``world```!",
				output: {
					type: "text",
					source: "Hello, ``world```!",
					content: "Hello, ``world```!",
				},
			},
			"link with start delimiter escaped": {
				input: "Hello, \\[world](image.png)!",
				output: {
					type: "text",
					source: "Hello, \\[world](image.png)!",
					content: "Hello, [world](image.png)!",
				},
			},
			"link with escaped left bracket": {
				input: "Hello, [wor\\[ld](image.png)!",
				output: {
					type: "fragment",
					source: "Hello, [wor\\[ld](image.png)!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "link",
							source: "[wor\\[ld](image.png)",
							href: "image.png",
							children: {
								type: "text",
								source: "wor\\[ld",
								content: "wor[ld",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"link with escaped right bracket": {
				input: "Hello, [wor\\]ld](image.png)!",
				output: {
					type: "fragment",
					source: "Hello, [wor\\]ld](image.png)!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "link",
							source: "[wor\\]ld](image.png)",
							href: "image.png",
							children: {
								type: "text",
								source: "wor\\]ld",
								content: "wor]ld",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"link with escaped left parenthesis": {
				input: "Hello, [world](https://\\(example.com)!",
				output: {
					type: "fragment",
					source: "Hello, [world](https://\\(example.com)!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "link",
							source: "[world](https://\\(example.com)",
							href: "https://(example.com",
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"link with escaped right parenthesis": {
				input: "Hello, [world](image.png\\))!",
				output: {
					type: "fragment",
					source: "Hello, [world](image.png\\))!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "link",
							source: "[world](image.png\\))",
							href: "image.png)",
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"link with formatted text": {
				input: "Hello, [**world**](image.png)!",
				output: {
					type: "fragment",
					source: "Hello, [**world**](image.png)!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "link",
							source: "[**world**](image.png)",
							href: "image.png",
							children: {
								type: "bold",
								source: "**world**",
								children: {
									type: "text",
									source: "world",
									content: "world",
								},
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"link with title": {
				input: 'Hello, [world](image.png "The world")!',
				output: {
					type: "fragment",
					source: 'Hello, [world](image.png "The world")!',
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "link",
							source: '[world](image.png "The world")',
							href: "image.png",
							title: "The world",
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"link with title and escaped quote": {
				input: 'Hello, [world](image.png "The \\"world\\"")!',
				output: {
					type: "fragment",
					source: 'Hello, [world](image.png "The \\"world\\"")!',
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "link",
							source: '[world](image.png "The \\"world\\"")',
							href: "image.png",
							title: 'The "world"',
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			image: {
				input: "Hello, ![world](image.png)!",
				output: {
					type: "fragment",
					source: "Hello, ![world](image.png)!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "image",
							source: "![world](image.png)",
							src: "image.png",
							alt: "world",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"image with start delimiter escaped": {
				input: "Hello, \\![world](image.png)!",
				output: {
					type: "fragment",
					source: "Hello, \\![world](image.png)!",
					children: [
						{
							type: "text",
							source: "Hello, \\!",
							content: "Hello, !",
						},
						{
							type: "link",
							source: "[world](image.png)",
							href: "image.png",
							children: {
								type: "text",
								source: "world",
								content: "world",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"image with escaped left bracket": {
				input: "Hello, ![wor\\[ld](image.png)!",
				output: {
					type: "fragment",
					source: "Hello, ![wor\\[ld](image.png)!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "image",
							source: "![wor\\[ld](image.png)",
							src: "image.png",
							alt: "wor[ld",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"image with escaped right bracket": {
				input: "Hello, ![wor\\]ld](image.png)!",
				output: {
					type: "fragment",
					source: "Hello, ![wor\\]ld](image.png)!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "image",
							source: "![wor\\]ld](image.png)",
							src: "image.png",
							alt: "wor]ld",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"image with escaped left parenthesis": {
				input: "Hello, ![world](https://\\(example.com)!",
				output: {
					type: "fragment",
					source: "Hello, ![world](https://\\(example.com)!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "image",
							source: "![world](https://\\(example.com)",
							src: "https://(example.com",
							alt: "world",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"image with escaped right parenthesis": {
				input: "Hello, ![world](image.png\\))!",
				output: {
					type: "fragment",
					source: "Hello, ![world](image.png\\))!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "image",
							source: "![world](image.png\\))",
							src: "image.png)",
							alt: "world",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"image with formatted text": {
				input: "Hello, ![**world**](image.png)!",
				output: {
					type: "fragment",
					source: "Hello, ![**world**](image.png)!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "image",
							source: "![**world**](image.png)",
							src: "image.png",
							alt: "**world**",
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"link with image": {
				input: "Hello, [![world](image.png)](https://example.com)!",
				output: {
					type: "fragment",
					source: "Hello, [![world](image.png)](https://example.com)!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "link",
							source: "[![world](image.png)](https://example.com)",
							href: "https://example.com",
							children: {
								type: "image",
								source: "![world](image.png)",
								src: "image.png",
								alt: "world",
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"mixed formatting": {
				input: "Hello, **_~~`[world](image.png)`~~_**!",
				output: {
					type: "fragment",
					source: "Hello, **_~~`[world](image.png)`~~_**!",
					children: [
						{
							type: "text",
							source: "Hello, ",
							content: "Hello, ",
						},
						{
							type: "bold",
							source: "**_~~`[world](image.png)`~~_**",
							children: {
								type: "italic",
								source: "_~~`[world](image.png)`~~_",
								children: {
									type: "strike",
									source: "~~`[world](image.png)`~~",
									children: {
										type: "code",
										source: "`[world](image.png)`",
										content: "[world](image.png)",
									},
								},
							},
						},
						{
							type: "text",
							source: "!",
							content: "!",
						},
					],
				},
			},
			"fenced code block with backticks": {
				input: "```\nconst x = 1;\n```",
				output: {
					type: "codeblock",
					content: "const x = 1;\n",
					source: "```\nconst x = 1;\n```",
				},
			},
			"fenced code block with tildes": {
				input: "~~~\nconst y = 2;\n~~~",
				output: {
					type: "codeblock",
					content: "const y = 2;\n",
					source: "~~~\nconst y = 2;\n~~~",
				},
			},
			"fenced code block with language": {
				input: "```typescript\nconst x: number = 1;\n```",
				output: {
					type: "codeblock",
					language: "typescript",
					content: "const x: number = 1;\n",
					source: "```typescript\nconst x: number = 1;\n```",
				},
			},
			"fenced code block with tildes and language": {
				input: "~~~python\nprint('hello')\n~~~",
				output: {
					type: "codeblock",
					language: "python",
					content: "print('hello')\n",
					source: "~~~python\nprint('hello')\n~~~",
				},
			},
			"code block containing markdown syntax": {
				input: "```markdown\n# Heading\n> Blockquote\n**Bold**\n```",
				output: {
					type: "codeblock",
					language: "markdown",
					content: "# Heading\n> Blockquote\n**Bold**\n",
					source: "```markdown\n# Heading\n> Blockquote\n**Bold**\n```",
				},
			},
			"code block with inner backticks": {
				input: "````\n```\ninner\n```\n````",
				output: {
					type: "codeblock",
					content: "```\ninner\n```\n",
					source: "````\n```\ninner\n```\n````",
				},
			},
			"code block unclosed at EOF": {
				input: "```js\nconsole.log(42);",
				output: {
					type: "codeblock",
					language: "js",
					content: "console.log(42);",
					source: "```js\nconsole.log(42);",
				},
			},
			"single-line blockquote": {
				input: "> Hello world",
				output: {
					type: "blockquote",
					source: "> Hello world",
					children: [
						{
							type: "text",
							source: "Hello world",
							content: "Hello world",
						},
					],
				},
			},
			"multi-line blockquote": {
				input: "> Hello world\n> Next line",
				output: {
					type: "blockquote",
					source: "> Hello world\n> Next line",
					children: [
						{
							type: "text",
							source: "Hello world\nNext line",
							content: "Hello world\nNext line",
						},
					],
				},
			},
			"blockquote with nested inline formatting": {
				input: "> This is **bold**",
				output: {
					type: "blockquote",
					source: "> This is **bold**",
					children: [
						{
							type: "text",
							source: "This is ",
							content: "This is ",
						},
						{
							type: "bold",
							source: "**bold**",
							children: {
								type: "text",
								source: "bold",
								content: "bold",
							},
						},
					],
				},
			},
			"blockquote with multiple paragraphs": {
				input: "> First paragraph\n>\n> Second paragraph",
				output: {
					type: "blockquote",
					source: "> First paragraph\n>\n> Second paragraph",
					children: [
						{
							type: "paragraph",
							source: "First paragraph",
							children: [
								{
									type: "text",
									source: "First paragraph",
									content: "First paragraph",
								},
							],
						},
						{
							type: "paragraph",
							source: "Second paragraph",
							children: [
								{
									type: "text",
									source: "Second paragraph",
									content: "Second paragraph",
								},
							],
						},
					],
				},
			},
			"nested blockquote": {
				input: "> > Nested quote",
				output: {
					type: "blockquote",
					source: "> > Nested quote",
					children: [
						{
							type: "blockquote",
							source: "> Nested quote",
							children: [
								{
									type: "text",
									source: "Nested quote",
									content: "Nested quote",
								},
							],
						},
					],
				},
			},
			"blockquote containing code block": {
				input: "> ```ts\n> const a = 1;\n> ```",
				output: {
					type: "blockquote",
					source: "> ```ts\n> const a = 1;\n> ```",
					children: [
						{
							type: "codeblock",
							language: "ts",
							source: "```ts\nconst a = 1;\n```",
							content: "const a = 1;\n",
						},
					],
				},
			},
			"empty fenced code block": {
				input: "```\n```",
				output: {
					type: "codeblock",
					content: "",
					source: "```\n```",
				},
			},
			"fenced code block with CRLF line endings": {
				input: "```js\r\nconst x = 1;\r\n```",
				output: {
					type: "codeblock",
					language: "js",
					content: "const x = 1;\r\n",
					source: "```js\r\nconst x = 1;\r\n```",
				},
			},
			"fenced code block with extended info string": {
				input: '```typescript title="example.ts"\nconst a = 1;\n```',
				output: {
					type: "codeblock",
					language: "typescript",
					content: "const a = 1;\n",
					source: '```typescript title="example.ts"\nconst a = 1;\n```',
				},
			},
			"fenced code block with longer closing fence": {
				input: "```\nhello\n`````",
				output: {
					type: "codeblock",
					content: "hello\n",
					source: "```\nhello\n`````",
				},
			},
			"fenced code block with whitespace around closing fence": {
				input: "```\ncode\n   ```   ",
				output: {
					type: "codeblock",
					content: "code\n",
					source: "```\ncode\n   ```   ",
				},
			},
			"fenced code block with 1-3 leading spaces": {
				input: "  ```py\nx = 1\n  ```",
				output: {
					type: "codeblock",
					language: "py",
					content: "x = 1\n",
					source: "  ```py\nx = 1\n  ```",
				},
			},
			"code fence with 4 leading spaces is not a fenced code block": {
				input: "    ```\n    code\n    ```",
				output: {
					type: "text",
					content: "    ```\n    code\n    ```",
					source: "    ```\n    code\n    ```",
				},
			},
			"escaped code fence at line start": {
				input: "\\``` not a code block",
				output: {
					type: "text",
					content: "``` not a code block",
					source: "\\``` not a code block",
				},
			},
			"paragraph directly followed by fenced code block": {
				input: "paragraph text\n```js\nconst x = 1;\n```",
				output: {
					type: "fragment",
					source: "paragraph text\n```js\nconst x = 1;\n```",
					children: [
						{
							type: "paragraph",
							source: "paragraph text",
							children: [
								{
									type: "text",
									source: "paragraph text",
									content: "paragraph text",
								},
							],
						},
						{
							type: "codeblock",
							language: "js",
							content: "const x = 1;\n",
							source: "```js\nconst x = 1;\n```",
						},
					],
				},
			},
			"empty blockquote single marker": {
				input: ">",
				output: {
					type: "blockquote",
					source: ">",
					children: [],
				},
			},
			"empty blockquote with trailing space": {
				input: "> ",
				output: {
					type: "blockquote",
					source: "> ",
					children: [],
				},
			},
			"empty blockquote multiple empty lines": {
				input: ">\n>",
				output: {
					type: "blockquote",
					source: ">\n>",
					children: [],
				},
			},
			"consecutive blockquotes separated by blank line": {
				input: "> First quote\n\n> Second quote",
				output: {
					type: "fragment",
					source: "> First quote\n\n> Second quote",
					children: [
						{
							type: "blockquote",
							source: "> First quote",
							children: [
								{
									type: "text",
									source: "First quote",
									content: "First quote",
								},
							],
						},
						{
							type: "blockquote",
							source: "> Second quote",
							children: [
								{
									type: "text",
									source: "Second quote",
									content: "Second quote",
								},
							],
						},
					],
				},
			},
			"blockquote containing heading": {
				input: "> # Heading in quote",
				output: {
					type: "blockquote",
					source: "> # Heading in quote",
					children: [
						{
							type: "heading",
							depth: 1,
							source: "# Heading in quote",
							children: [
								{
									type: "text",
									source: "Heading in quote",
									content: "Heading in quote",
								},
							],
						},
					],
				},
			},
			"blockquote containing unclosed code block": {
				input: "> ```ts\n> const a = 1;",
				output: {
					type: "blockquote",
					source: "> ```ts\n> const a = 1;",
					children: [
						{
							type: "codeblock",
							language: "ts",
							source: "```ts\nconst a = 1;",
							content: "const a = 1;",
						},
					],
				},
			},
			"blockquote with 1-3 leading spaces": {
				input: "   > Indented quote",
				output: {
					type: "blockquote",
					source: "   > Indented quote",
					children: [
						{
							type: "text",
							source: "Indented quote",
							content: "Indented quote",
						},
					],
				},
			},
			"escaped blockquote at line start": {
				input: "\\> not a quote",
				output: {
					type: "text",
					content: "> not a quote",
					source: "\\> not a quote",
				},
			},
			"paragraph directly followed by blockquote": {
				input: "Paragraph text\n> Quote text",
				output: {
					type: "fragment",
					source: "Paragraph text\n> Quote text",
					children: [
						{
							type: "paragraph",
							source: "Paragraph text",
							children: [
								{
									type: "text",
									source: "Paragraph text",
									content: "Paragraph text",
								},
							],
						},
						{
							type: "blockquote",
							source: "> Quote text",
							children: [
								{
									type: "text",
									source: "Quote text",
									content: "Quote text",
								},
							],
						},
					],
				},
			},
			"blockquote directly followed by paragraph": {
				input: "> Quote text\nParagraph text",
				output: {
					type: "fragment",
					source: "> Quote text\nParagraph text",
					children: [
						{
							type: "blockquote",
							source: "> Quote text",
							children: [
								{
									type: "text",
									source: "Quote text",
									content: "Quote text",
								},
							],
						},
						{
							type: "paragraph",
							source: "Paragraph text",
							children: [
								{
									type: "text",
									source: "Paragraph text",
									content: "Paragraph text",
								},
							],
						},
					],
				},
			},
			"heading with trailing hashes": {
				input: "# Hello World #",
				output: {
					type: "heading",
					depth: 1,
					source: "# Hello World #",
					children: [
						{
							type: "text",
							source: "Hello World #",
							content: "Hello World",
						},
					],
				},
			},
			"heading with multiple trailing hashes": {
				input: "## Subtitle ####",
				output: {
					type: "heading",
					depth: 2,
					source: "## Subtitle ####",
					children: [
						{
							type: "text",
							source: "Subtitle ####",
							content: "Subtitle",
						},
					],
				},
			},
			"hash without space is not a heading": {
				input: "#NotAHeading",
				output: {
					type: "text",
					content: "#NotAHeading",
					source: "#NotAHeading",
				},
			},
			"escaped heading at line start": {
				input: "\\# not a heading",
				output: {
					type: "text",
					content: "# not a heading",
					source: "\\# not a heading",
				},
			},
			"heading with 1-3 leading spaces": {
				input: "   ### Indented heading",
				output: {
					type: "heading",
					depth: 3,
					source: "   ### Indented heading",
					children: [
						{
							type: "text",
							source: "Indented heading",
							content: "Indented heading",
						},
					],
				},
			},
			"deeply nested blockquote": {
				input: "> > > Deep quote",
				output: {
					type: "blockquote",
					source: "> > > Deep quote",
					children: [
						{
							type: "blockquote",
							source: "> > Deep quote",
							children: [
								{
									type: "blockquote",
									source: "> Deep quote",
									children: [
										{
											type: "text",
											source: "Deep quote",
											content: "Deep quote",
										},
									],
								},
							],
						},
					],
				},
			},
			"fenced code block directly followed by blockquote": {
				input: "```\ncode\n```\n> quote",
				output: {
					type: "fragment",
					source: "```\ncode\n```\n> quote",
					children: [
						{
							type: "codeblock",
							content: "code\n",
							source: "```\ncode\n```",
						},
						{
							type: "blockquote",
							source: "> quote",
							children: [
								{
									type: "text",
									source: "quote",
									content: "quote",
								},
							],
						},
					],
				},
			},
		}),
	)("should parse %s", (_, { input, output }) => {
		expect(parse(input)).toEqual(output);
	});
});
