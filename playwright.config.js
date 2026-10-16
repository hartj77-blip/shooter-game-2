// Settings for the browser smoke test (tests/smoke). Run with `npm run smoke`.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 60_000,
  // One test at a time: each draws 3D in software (the co-op test draws two
  // tabs at once), and sharing the CPU between tests would make them crawl.
  workers: 1,
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      // Headless browsers have no graphics card, so draw WebGL in software.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true,
  },
});
