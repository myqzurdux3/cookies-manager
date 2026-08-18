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
    },
  },
});
