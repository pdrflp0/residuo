import { createApiApp } from './app';

const app = await createApiApp({
  databaseUrl: process.env.LAB_DATABASE_URL ?? 'postgres://residuo:residuo-local-only@localhost:54329/residuo_lab',
  referenceServiceUrl: process.env.REFERENCE_SERVICE_URL ?? 'http://127.0.0.1:4100',
  ...(process.env.WEB_DIST ? { webDist: process.env.WEB_DIST } : {}),
  ai: {
    ...(process.env.ANTHROPIC_API_KEY ? { apiKey: process.env.ANTHROPIC_API_KEY } : {}),
    ...(process.env.RESIDUO_AI_MODEL ? { model: process.env.RESIDUO_AI_MODEL } : {}),
    ...(process.env.RESIDUO_AI_BASE_URL ? { baseURL: process.env.RESIDUO_AI_BASE_URL } : {}),
  },
});
const port = Number(process.env.API_PORT ?? 4000);
await app.listen(port, process.env.HOST ?? '127.0.0.1');
console.log(`[api] ouvindo em http://localhost:${port}/api`);
