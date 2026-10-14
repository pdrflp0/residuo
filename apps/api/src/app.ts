import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TargetAdapter } from '@residuo/contracts';
import { ReferenceHttpAdapter } from '@residuo/engine';
import type { NextFunction, Request, Response } from 'express';
import pg from 'pg';
import { ComparisonsController, MetaController, REFERENCE_URL, RunsController } from './controllers';
import { ensureDatabase, LAB_SCHEMA } from './db';
import { LAB_POOL, LabStore } from './lab-store';
import { RunExecutor, TARGET_ADAPTER } from './run-executor';

export interface ApiOptions {
  databaseUrl: string;
  /** Somente o serviço de referência local. Não há campo para testar URLs arbitrárias. */
  referenceServiceUrl: string;
  adapter?: TargetAdapter;
  webDist?: string;
  logger?: boolean;
}

export async function createApiApp(opts: ApiOptions): Promise<NestExpressApplication> {
  await ensureDatabase(opts.databaseUrl);
  const pool = new pg.Pool({ connectionString: opts.databaseUrl, max: 10 });
  // Conexão ociosa derrubada (ex.: Postgres reiniciado) não deve derrubar o processo; a próxima consulta reconecta.
  pool.on('error', (err) => console.error(`[api] conexão do pool perdida: ${err.message}`));
  await pool.query(LAB_SCHEMA);
  const adapter = opts.adapter ?? new ReferenceHttpAdapter(opts.referenceServiceUrl);

  @Module({
    controllers: [MetaController, RunsController, ComparisonsController],
    providers: [
      { provide: LAB_POOL, useValue: pool },
      { provide: TARGET_ADAPTER, useValue: adapter },
      { provide: REFERENCE_URL, useValue: opts.referenceServiceUrl },
      LabStore,
      RunExecutor,
    ],
  })
  class ApiModule {}

  const app = await NestFactory.create<NestExpressApplication>(ApiModule, {
    logger: opts.logger === false ? false : ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  // Em produção local (docker compose), a API também serve a interface já compilada.
  if (opts.webDist && existsSync(join(opts.webDist, 'index.html'))) {
    app.useStaticAssets(opts.webDist);
    const index = join(opts.webDist, 'index.html');
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) return res.sendFile(index);
      next();
    });
  }
  return app;
}
