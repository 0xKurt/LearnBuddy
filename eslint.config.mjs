// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      '**/.vercel/**',
      '**/.turbo/**',
      '**/coverage/**',
      'LearnBuddy/**',
      'design-examples/**',
      'docs/**',
      // Tool config files loaded as CommonJS by their tools regardless of
      // package.json type — let them speak require/module without lint noise.
      '**/babel.config.js',
      '**/metro.config.js',
      '**/tailwind.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  prettier,
);
