// Lint do projeto (cliente, servidor, regras compartilhadas e testes).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-server/**', 'node_modules/**', 'backup/**', 'jogar/**', 'data-server/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    files: ['**/*.cjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node }, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  { files: ['scripts/**/*.mjs'], languageOptions: { sourceType: 'module' } },
  // os testes E2E executam funções dentro do navegador (page.evaluate)
  { files: ['tests/e2e/**/*.cjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
);
