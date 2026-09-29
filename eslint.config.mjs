import js from "@eslint/js";

export default [
  { ignores: ["node_modules/**", "example/*.html"] },
  {
    files: ["**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { console: "readonly", process: "readonly", fetch: "readonly", URL: "readonly", structuredClone: "readonly" },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-warning-comments": ["error", { terms: ["todo", "fixme"], location: "anywhere" }],
      complexity: ["error", 15],
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 120, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 5],
      "no-param-reassign": "error",
    },
  },
  {
    // The CLI and the tests print for a living.
    files: ["src/cli.mjs", "test/**/*.mjs"],
    rules: { "no-console": "off" },
  },
];
