import globals from "globals";
import pluginJs from "@eslint/js";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    languageOptions: { 
      globals: {
        ...globals.browser,
        ...globals.node, // Add Node globals like Buffer, process, etc.
      } 
    }
  },
  pluginJs.configs.recommended,
  {
    rules: {
      "no-unused-vars": ["error", { 
        "argsIgnorePattern": "^_", 
        "varsIgnorePattern": "^_" 
      }],
      "no-empty": "warn"
    }
  }
];