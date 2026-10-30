import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * The runtime of plugins' screens, as Toppo serves it in their frames: one classic script, since
 * a frame without an origin loads no module, and its stylesheet, with Toppo's theme.
 */
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // A library build keeps `process.env` for its consumers to set: the frame has none. Tests run
  // React as it develops, for its warnings.
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    lib: {
      entry: 'src/main.tsx',
      formats: ['iife'],
      name: 'toppoScreenRuntime',
      fileName: () => 'runtime.js',
      cssFileName: 'runtime',
    },
  },
  test: {
    // Beside the web app's (41315) and the design system's (41316), below Windows' reserved ports.
    api: { port: 41317 },
    include: ['src/**/*.test.{ts,tsx}'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
}));
