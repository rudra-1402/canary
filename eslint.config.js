import baseConfig from './packages/config/eslint-base.js';
import reactConfig from './packages/config/eslint-react.js';
import importX from 'eslint-plugin-import-x';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/venv/**', '**/.pytest_cache/**'],
  },
  ...baseConfig,
  {
    files: ['apps/api/**/*.js', 'packages/**/*.js'],
  },
  {
    files: ['apps/web/**/*.{js,jsx}'],
    ...reactConfig[0],
  },
  ...reactConfig.slice(1).map((c) => ({ ...c, files: ['apps/web/**/*.{js,jsx}'] })),
  {
    files: ['apps/web/src/**/*.{js,jsx}'],
    plugins: { 'import-x': importX },
    rules: {
      // Enforces the bulletproof-react boundary: features may not import each other,
      // and nothing may reach into app/ from below it. Empty `features/` today (Plan A
      // only scaffolded app/) — this rule activates automatically once features/ exists.
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './apps/web/src/features/!(*/**)',
              from: './apps/web/src/features',
              except: ['./index.js', './index.jsx'],
            },
            {
              target: './apps/web/src/app',
              from: './apps/web/src/features',
            },
          ],
        },
      ],
    },
  },
];
