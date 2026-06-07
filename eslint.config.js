const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "coverage/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "error",
      // Honor the `_`-prefix convention for intentionally-unused args/vars/catch
      // bindings (e.g. `_data` in param decorators, a reserved `_ip`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ]
    }
  }
);
