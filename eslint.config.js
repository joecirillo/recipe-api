import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', '.wrangler/**', '**/*.jsonc'],
  },
  // Type-aware rules (no-floating-promises, etc.) require parserOptions.project — deferred until tsconfig paths are stable.
  ...tsPlugin.configs['flat/recommended'],
  prettierConfig,
];
