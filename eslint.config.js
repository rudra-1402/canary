import baseConfig from './packages/config/eslint-base.js';
import reactConfig from './packages/config/eslint-react.js';
import importX from 'eslint-plugin-import-x';

export default [
  {
    // The pytest temp dirs are permission-locked on Windows; without them here, eslint's
    // glob walk dies with EPERM before it lints a single file. Mirrors .gitignore.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/venv/**',
      '**/.pytest_cache/**',
      '**/.pytest-*/**',
      '**/.codex-pytest-*/**',
      '**/.tmp-pytest/**',
      '**/.test-tmp/**',
    ],
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
    // Registry-vendored components (shadcn CLI output). These are copied-in source we own
    // but do not hand-write: shadcn emits kebab-case filenames, spreads props rather than
    // declaring them, and documents its API on the registry site instead of via PropTypes.
    // Without this, every `shadcn add` breaks CI on react/prop-types — which would make the
    // registry model unusable. Hand-written primitives keep full checking: they are
    // PascalCase (Button.jsx, TrustBadge.jsx) and are not matched here.
    files: ['apps/web/src/components/ui/*-*.jsx', 'apps/web/src/components/ui/[a-z]*.jsx'],
    rules: {
      'react/prop-types': 'off',
      'no-unused-vars': 'warn',
    },
  },
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
