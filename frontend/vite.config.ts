/**
 * Build : le résultat est écrit dans backend/public, servi par NestJS.
 * Développement : Vite redirige les appels vers le backend lancé sur le port 3000.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../backend/public', emptyOutDir: true },
  server: {
    proxy: {
      '/auth': api,
      '/me': api,
      '/users': api,
      '/conversations': api,
      '/messages': api,
      '/health': api,
      '/socket.io': { target: api, ws: true },
    },
  },
});
