import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./src/global-setup.ts'],
    setupFiles: ['./src/setup-file.ts'],
    // 同じ DB を使うため、ファイルを並列に実行しない
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
