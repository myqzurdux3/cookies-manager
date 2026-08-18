import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Implémenter une interface qui rend des promesses sans avoir rien à
      // attendre est correct, et c'est ce que font tous les faux des tests.
      // La règle se déclencherait 62 fois sur du code juste.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Scripts hors du programme TypeScript : pas d'analyse typée, et les
    // globales de Node plutôt que celles du navigateur.
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        WebSocket: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
      },
    },
  },
);
