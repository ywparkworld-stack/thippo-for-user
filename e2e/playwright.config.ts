import { defineConfig, devices } from '@playwright/test';
import { urls } from './support/env';

/**
 * E2E テスト。Supabase のローカル環境（supabase start）と、ビルド済みの3アプリに対して実行する。
 * 手順は e2e/README.md を参照。
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: (['guest', 'host', 'admin'] as const).map((app) => ({
    command: `pnpm --filter @thippo/${app} start`,
    url: `${urls[app]}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe' as const,
  })),
});
