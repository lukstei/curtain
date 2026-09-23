import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/types.ts",
				"src/lib/markdown/ast.ts",
				"src/test-utils.ts",
				"src/**/*.test.ts",
			],
		},
	},
});
