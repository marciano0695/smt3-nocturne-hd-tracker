import react from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

export default defineConfig({
	base: "./",
	plugins: [react()],
	test: {
		include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
		environment: "node",
	},
	lint: {
		ignorePatterns: ["dist/**"],
		plugins: [
			"eslint",
			"typescript",
			"unicorn",
			"oxc",
			"react",
			"jsx-a11y",
			"vitest",
		],
		options: {
			typeAware: true,
			typeCheck: true,
		},
	},
	fmt: {
		singleQuote: true,
		// Game data and fixtures are hand-edited by the player; keep their layout as written.
		ignorePatterns: ["dist/**", "data/**", "tests/fixtures/**", "*.md"],
	},
})
