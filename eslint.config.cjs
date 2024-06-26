const globals = require("globals");
const js = require("@eslint/js");

const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

module.exports = [
  {
    ignores: [
      "**/.github",
      "**/data",
      "**/node_modules",
      "**/.env",
      "**/.env.example",
      "**/.gitignore",
      "**/.git",
      "**/.prettierrc.json",
      "**/LICENSE",
      "**/package.json",
      "**/package-lock.json",
      "**/logs.txt",
      "**/README.md",
    ],
  },
  ...compat.extends("eslint:recommended", "prettier"),
  {
    languageOptions: {
      globals: {
        ...globals.commonjs,
        ...globals.node,
      },

      ecmaVersion: "latest",
      sourceType: "commonjs",
    },

    rules: {},
  },
];
