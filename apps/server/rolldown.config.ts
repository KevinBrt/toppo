import { isAbsolute } from 'node:path';
import { defineConfig } from 'rolldown';

/**
 * Workspace packages (`@toppo-tracker/*`) are bundled from source; third-party packages stay external
 * and are installed with `npm ci --omit=dev` in the Docker image.
 */
function isExternal(id: string): boolean {
  const isRelative = id.startsWith('.') || isAbsolute(id);
  return !(isRelative || id.startsWith('@toppo-tracker/'));
}

export default defineConfig({
  input: {
    main: 'src/main.ts',
    healthcheck: 'src/healthcheck.ts',
  },
  platform: 'node',
  external: isExternal,
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
  },
});
