import pg from 'pg';

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
        if ((err as { code?: string }).code !== '42P04') throw err;
      }
    }
  } finally {
    await client.end();
  }
}

export const TARGET_SCHEMA = `
CREATE TABLE IF NOT EXISTS namespaces (
  ns          text PRIMARY KEY,
  mode        text NOT NULL CHECK (mode IN ('vulnerable', 'guarded')),
  fault       text NOT NULL DEFAULT 'none',
  created_at  timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS cache_entries (
  ns         text NOT NULL REFERENCES namespaces(ns) ON DELETE CASCADE,
  id         text NOT NULL,
  payload    jsonb NOT NULL,
  cached_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ns, id)
);
CREATE TABLE IF NOT EXISTS search_index (
  ns               text NOT NULL REFERENCES namespaces(ns) ON DELETE CASCADE,
  id               text NOT NULL,
  generation       int  NOT NULL,
  revision         int  NOT NULL,
  title            text,
  last_written_by  text NOT NULL,
  PRIMARY KEY (ns, id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  ns           text NOT NULL REFERENCES namespaces(ns) ON DELETE CASCADE,
  snapshot_id  text NOT NULL,
  rows         jsonb NOT NULL,
  taken_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ns, snapshot_id)
);

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
