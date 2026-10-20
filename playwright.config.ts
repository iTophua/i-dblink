import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 用完整 chromium 的新 headless 模式（本机已有 chromium-1217），
        // 避免依赖单独的 headless_shell 下载
        channel: 'chromium',
      },
    },
  ],

  webServer: {
    command: 'wails dev',
    port: 5100,
    reuseExisting: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
