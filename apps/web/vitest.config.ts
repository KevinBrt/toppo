import { availableParallelism } from 'node:os';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Tests reach no server: the fake one answers `fetch`, and nothing is proxied, not even an
// image's address, whether a development server runs or not.
const { server: _developmentServer, ...appConfig } = viteConfig;

export default mergeConfig(
  appConfig,
  defineConfig({
    // The dev server's strict port must not apply to tests: browser suites run in parallel.
    server: { strictPort: false },
    // Found by Vite only once tests run: optimizing them then reloads the browser, and a test file
    // loading at that moment never starts (seen on a cold cache, as in CI).
    optimizeDeps: { include: ['get-nonce', 'react-dom/client'] },
    test: {
      // Below the dynamic ports (49152 and up), where Windows reserves blocks at random for Hyper-V
      // and WSL: Vitest's default, 63315, sometimes falls in one and the browser never starts.
      api: { port: 41315 },
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test-setup.ts'],
      // Each worker is a Chromium of its own: eight run the tests as fast as one per core, without
      // taking the whole machine. Never more than Vitest's default, one fewer than the cores.
      maxWorkers: Math.max(1, Math.min(8, availableParallelism() - 1)),
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: 'chromium' }],
      },
    },
  }),
);
