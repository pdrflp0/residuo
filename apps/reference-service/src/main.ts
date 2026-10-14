import { createReferenceApp } from './app';

const databaseUrl = process.env.TARGET_DATABASE_URL ?? 'postgres://residuo:residuo-local-only@localhost:54329/residuo_target';
const port = Number(process.env.REFERENCE_PORT ?? 4100);

const app = await createReferenceApp({ databaseUrl });
await app.listen(port, process.env.HOST ?? '127.0.0.1');
console.log(`[reference-service] ouvindo em http://localhost:${port}`);
