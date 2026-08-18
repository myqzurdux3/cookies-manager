/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'popup.html',
        options: 'options.html',
        background: 'src/background.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      // Seul `src/` compte : mesurer les tests eux-mêmes ne dit rien.
      include: ['src/**/*.ts'],
      // Déclarations de types pures, sans code exécutable.
      exclude: ['src/vite-env.d.ts'],
      // Seuils posés sous les valeurs atteintes : ils servent à repérer une
      // régression, pas à imposer un chiffre. `background.ts` reste hors
      // couverture unitaire — c'est du câblage `chrome.*`, exercé par
      // `npm run verify:browser`.
      thresholds: { lines: 93, statements: 93, branches: 92, functions: 98 },
    },
  },
});
