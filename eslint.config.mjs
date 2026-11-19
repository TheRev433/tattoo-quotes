// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.angular/**',
      '**/coverage/**',
      '**/out-tsc/**',
      'data/**',
      'uploads/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
  {
    files: ['apps/api/**/*.ts', 'scripts/**/*.mjs', '*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
);
