import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  localStorage: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  chrome: 'readonly',
  browser: 'readonly',
  URL: 'readonly',
  Blob: 'readonly',
  Image: 'readonly',
  AbortController: 'readonly',
  matchMedia: 'readonly',
  HTMLElement: 'readonly',
  MutationObserver: 'readonly',
  requestAnimationFrame: 'readonly',
  getComputedStyle: 'readonly',
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.shots/**', 'coverage/**', 'public/*.zip'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['public/**/*.js', 'scripts/**/*.mjs', 'bench/**/*.ts'],
    languageOptions: {
      globals: browserGlobals,
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly' } },
  },
  prettier,
);
