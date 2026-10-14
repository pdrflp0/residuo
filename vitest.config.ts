import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'engine', include: ['packages/engine/test/**/*.test.ts', 'apps/web/test/**/*.test.ts'] },
      },
      {
        test: {
          name: 'integration',
          include: ['apps/reference-service/test/**/*.test.ts', 'apps/api/test/**/*.test.ts', 'tests/level2/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // os testes de integração compartilham o mesmo Postgres de teste; arquivos em série
          fileParallelism: false,
        },
      },
    ],
  },
});
