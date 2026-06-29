import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  root: path.resolve(__dirname, 'src/renderer'),
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  // Tests laufen vom Projekt-Root, damit auch Main-Prozess-Module
  // (src/main/**) abgedeckt werden – nicht nur src/renderer.
  test: {
    root: __dirname,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
});
