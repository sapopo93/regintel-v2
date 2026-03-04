import { defineConfig } from 'oxlint';

export default defineConfig({
  rules: {
    // Error, Never Warn - strict defaults
    'no-console': 'error',
    'no-debugger': 'error',
    'no-unused-vars': 'error',
    'no-undef': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'no-duplicate-imports': 'error',
    'eqeqeq': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-wrappers': 'error',
    'no-throw-literal': 'error',
    'no-useless-catch': 'error',
    'no-useless-rename': 'error',
    'no-self-compare': 'error',
    'no-template-curly-in-string': 'error',
  },
  ignorePatterns: ['node_modules', 'dist', '.next', '*.test.ts'],
});
