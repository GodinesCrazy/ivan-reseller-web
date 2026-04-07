// ESLint configuration for Ivan Reseller Web frontend
// Uses only plugins actually installed: @typescript-eslint + react-hooks
// This formalizes the project's lint policy so VSCode uses consistent rules.
module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', 'coverage'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  rules: {
    // Allow `any` in ML API / complex boundary code
    '@typescript-eslint/no-explicit-any': 'warn',
    // Unused vars: ignore underscore-prefixed names
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Hooks deps: warn, not error
    'react-hooks/exhaustive-deps': 'warn',
    // Non-null assertions allowed (intentional in ML API code)
    '@typescript-eslint/no-non-null-assertion': 'off',
    // Empty functions allowed (stubs, event noop handlers)
    '@typescript-eslint/no-empty-function': 'off',
    // console.log: warn so debug statements are visible but not blocking
    'no-console': 'warn',
    // Empty interfaces are fine (extensible type scaffolding)
    '@typescript-eslint/no-empty-interface': 'off',
    // Allow require() in config files
    '@typescript-eslint/no-var-requires': 'off',
    // Allow ts-ignore with description
    '@typescript-eslint/ban-ts-comment': 'warn',
  },
  overrides: [
    {
      files: ['**/*.test.{ts,tsx}', '**/__tests__/**'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
      },
    },
    {
      // Playwright e2e tests run under a separate runner, not vitest
      files: ['e2e/**'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
