import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Below the dynamic ports (49152 and up), where Windows reserves blocks at random for Hyper-V
    // and WSL: Vitest's default, 63315, sometimes falls in one and the browser never starts.
    // Not the web app's (41315): both run at once.
    api: { port: 41316 },
    include: ['src/**/*.test.tsx'],
    setupFiles: ['src/test-setup.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
