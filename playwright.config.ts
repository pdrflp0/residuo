import { defineConfig, devices } from '@playwright/test';

/**
 * Ponta a ponta com serviços reais em portas e bancos próprios (residuo_*_e2e),
 * para não misturar com o ambiente de desenvolvimento.
 */
const DB = 'postgres://residuo:residuo-local-only@localhost:54329';

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5183',
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'npm run start -w @residuo/reference-service',
      url: 'http://127.0.0.1:4110/health',
      env: { TARGET_DATABASE_URL: `${DB}/residuo_target_e2e`, REFERENCE_PORT: '4110' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run start -w @residuo/api',
      url: 'http://127.0.0.1:4010/api/health',
      env: { LAB_DATABASE_URL: `${DB}/residuo_lab_e2e`, REFERENCE_SERVICE_URL: 'http://127.0.0.1:4110', API_PORT: '4010' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5183 --strictPort',
      cwd: 'apps/web',
      url: 'http://127.0.0.1:5183',
      env: { API_URL: 'http://127.0.0.1:4010' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
