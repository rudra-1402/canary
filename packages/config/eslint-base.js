import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

// Shared across every JS workspace member — Node globals + core recommended rules.
// Framework-specific additions (React, Tailwind) live in eslint-react.js.
export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // `const { omitMe, ...rest } = obj` is the standard "destructure to omit a
      // property" idiom — omitMe is intentionally unused, not a mistake.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  prettierConfig,
];
