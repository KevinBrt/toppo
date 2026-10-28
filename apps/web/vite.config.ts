import tailwindcss from '@tailwindcss/vite';
import { CSP_NONCE_PLACEHOLDER } from '@toppo-tracker/shared';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** In development, Vite serves the app and forwards API calls to the Fastify server. */
const SERVER_URL = 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  html: {
    cspNonce: CSP_NONCE_PLACEHOLDER,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': SERVER_URL,
      '/health': SERVER_URL,
    },
  },
  build: {
    sourcemap: true,
  },
});
