import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:43128', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 43128',
    url: 'http://127.0.0.1:43128/login',
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'production',
      APP_PASSWORD: 'browser-test-password',
      AUTH_SECRET: 'browser-test-secret-not-for-deployment',
      COOKIE_SECURE: 'false',
      TRUST_PROXY: 'false',
      PYTHON_EXECUTABLE: process.execPath,
      PYTHON_CLI_PATH: path.resolve('tests/fixtures/runner.mjs'),
      PYTHON_TIMEOUT_MS: '10000',
      PYTHON_MAX_CONCURRENT: '4',
      PYTHON_MAX_OUTPUT_BYTES: '4194304',
    },
  },
});
