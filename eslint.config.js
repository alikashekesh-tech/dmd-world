// Lint for the storefront (src/), the admin (admin/src/), shared code and the build configs: `npm run lint`.
// The API (backend/) is PHP: Pint checks it (backend/vendor/bin/pint --test).
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const jsx = { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } };

export default [
  { ignores: ['**/dist/**', 'node_modules/**', 'video/**', 'backend/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', 'admin/src/**/*.{js,jsx}', 'shared/**/*.js'],
    languageOptions: { ...jsx, globals: { ...globals.browser, __SERVER_FORWARD_CONSOLE__: 'readonly', __BUNDLED_DEV__: 'readonly' } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // JSX components count as used variables (no React plugin needed for that one rule).
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // Drawing helpers share one (colour, colour2, colour3, options) signature; not every shape uses every colour.
  { files: ['src/components/art/**/*.jsx'], rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', args: 'none' }] } },
  {
    files: ['*.config.js', 'admin/*.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off', // input sanitising strips control characters on purpose
    },
  },
];
