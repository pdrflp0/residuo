import pg from 'pg';

/** Cria o banco se ainda não existir (Docker, Homebrew ou qualquer Postgres local). */
export async function ensureDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`nome de banco inválido: ${name}`);
  url.pathname = '/postgres';
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) {
      try {
        await client.query(`CREATE DATABASE ${name}`);
      } catch (err) {
        if ((err as { code?: string }).code !== '42P04') throw err; // criado em paralelo por outro processo
      }
    }
  } finally {
    await client.end();
  }
}

/**
 * Esquema do alvo. Tudo é chaveado por `ns` (namespace de execução) com ON DELETE CASCADE:
 * o reset de uma execução apaga somente as linhas daquele namespace.
 */
export const TARGET_SCHEMA = `
CREATE TABLE IF NOT EXISTS namespaces (
  ns          text PRIMARY KEY,
  mode        text NOT NULL CHECK (mode IN ('vulnerable', 'guarded')),
  fault       text NOT NULL DEFAULT 'none',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Contador de gerações por id: sobrevive à exclusão, por isso "criar de novo" abre g2, não g1.
CREATE TABLE IF NOT EXISTS identities (
  ns               text NOT NULL REFERENCES namespaces(ns) ON DELETE CASCADE,
  id               text NOT NULL,
  last_generation  int  NOT NULL,
  PRIMARY KEY (ns, id)
);

CREATE TABLE IF NOT EXISTS items (
  ns               text NOT NULL REFERENCES namespaces(ns) ON DELETE CASCADE,
  id               text NOT NULL,
  generation       int  NOT NULL,
  revision         int  NOT NULL,
  data             jsonb NOT NULL,
  last_written_by  text NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ns, id)
);

-- Registro de exclusões. No modo guarded funciona como marcador de exclusão (tombstone)
-- por (id, geração). No modo vulnerable existe só para confirmar a exclusão: o consumidor o ignora.
CREATE TABLE IF NOT EXISTS deletions (
  ns              text NOT NULL REFERENCES namespaces(ns) ON DELETE CASCADE,
  deletion_id     text NOT NULL,
  id              text NOT NULL,
  generation      int  NOT NULL,
  revision        int  NOT NULL,
  snapshot        jsonb NOT NULL,
  mechanism       text NOT NULL,
  status          text NOT NULL,
  effective_at    timestamptz,
  restored_at     timestamptz,
  restore_id      text,
  restored_by     text,
  restore_reason  text,
  PRIMARY KEY (ns, deletion_id)
);
CREATE INDEX IF NOT EXISTS deletions_by_generation ON deletions (ns, id, generation);

-- Fila de entregas pendentes (outbox do cliente offline). prepared -> held -> delivered.
CREATE TABLE IF NOT EXISTS deliveries (
  ns              text NOT NULL REFERENCES namespaces(ns) ON DELETE CASCADE,
  delivery_id     text NOT NULL,
  entity_id       text NOT NULL,
  generation      int  NOT NULL,
  base_revision   int  NOT NULL,
  data            jsonb NOT NULL,
  status          text NOT NULL CHECK (status IN ('prepared', 'held', 'delivered')),
  delivery_count  int  NOT NULL DEFAULT 0,
  last_outcome    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  PRIMARY KEY (ns, delivery_id)
);

-- Inbox do consumidor protegido: deduplicação por id de entrega.
CREATE TABLE IF NOT EXISTS inbox (
  ns            text NOT NULL REFERENCES namespaces(ns) ON DELETE CASCADE,
  delivery_id   text NOT NULL,
  outcome       text,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ns, delivery_id)
);
`;

export type Tx = pg.PoolClient;

export async function inTransaction<T>(pool: pg.Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    const result = await fn(tx);
    await tx.query('COMMIT');
    return result;
  } catch (err) {
    await tx.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    tx.release();
  }
}
