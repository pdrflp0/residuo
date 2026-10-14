import 'reflect-metadata';
import { type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { DeliveriesController, ItemsController, MetaController, NamespacesController } from './controllers';
import { ensureDatabase, TARGET_SCHEMA } from './db';
import { PG_POOL, TargetStore } from './store';

export interface ReferenceAppOptions {
  databaseUrl: string;
  logger?: boolean;
}

export async function createReferenceApp(opts: ReferenceAppOptions): Promise<INestApplication> {
  await ensureDatabase(opts.databaseUrl);
  const pool = new pg.Pool({ connectionString: opts.databaseUrl, max: 10 });
  // Conexão ociosa derrubada (ex.: Postgres reiniciado) não deve derrubar o processo; a próxima consulta reconecta.
  pool.on('error', (err) => console.error(`[reference-service] conexão do pool perdida: ${err.message}`));
  await pool.query(TARGET_SCHEMA);

  @Module({
    controllers: [MetaController, NamespacesController, ItemsController, DeliveriesController],
    providers: [{ provide: PG_POOL, useValue: pool }, TargetStore],
  })
  class ReferenceModule {}

  const app = await NestFactory.create(ReferenceModule, { logger: opts.logger === false ? false : ['error', 'warn', 'log'] });
  app.enableShutdownHooks();
  return app;
}

export { SERVICE_VERSION } from './controllers';
