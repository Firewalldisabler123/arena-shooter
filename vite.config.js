import { defineConfig } from 'vite';

// Relativer Basispfad: funktioniert unter https://BENUTZER.github.io/arena-shooter/ und lokal.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
