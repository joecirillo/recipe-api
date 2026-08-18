import tsPlugin from '@typescript-eslint/eslint-plugin'
import prettierConfig from 'eslint-config-prettier'

export default [
  {
    ignores: ['node_modules/**', 'dist/**', '.wrangler/**', '**/*.jsonc'],
  },
  // @typescript-eslint/parser is pinned in package.json as a direct devDep (peer of the plugin);
  // flat/recommended wires it in internally so it does not appear in this file.
  // Type-aware rules (no-floating-promises, etc.) require parserOptions.project — deferred until tsconfig paths are stable.
  ...tsPlugin.configs['flat/recommended'],
  prettierConfig,
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
