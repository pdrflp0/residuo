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

/** Esquema do laboratório: histórico explicativo, separado da verdade do alvo testado. */
export const LAB_SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id                text PRIMARY KEY,
  scenario_id       text NOT NULL,
  scenario_version  text NOT NULL,
  engine_version    text NOT NULL,
  adapter           jsonb NOT NULL,
  config            jsonb NOT NULL,
  namespace         text NOT NULL UNIQUE,
  entity_id         text NOT NULL,
  status            text NOT NULL,
  next_step_id      text,
  verdict           jsonb,
  replay_of         text REFERENCES runs(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz
);
CREATE INDEX IF NOT EXISTS runs_created ON runs (created_at DESC);

CREATE TABLE IF NOT EXISTS step_observations (
  run_id       text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq          int  NOT NULL,
  step_id      text NOT NULL,
  kind         text NOT NULL,
  lane         text NOT NULL,
  title        text NOT NULL,
  status       text NOT NULL,
  started_at   timestamptz NOT NULL,
  finished_at  timestamptz NOT NULL,
  exchange     jsonb,
  facts        jsonb NOT NULL,
  error        text,
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE IF NOT EXISTS violations (
  run_id           text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  idx              int  NOT NULL,
  invariant        text NOT NULL,
  entity_id        text NOT NULL,
  generation       int  NOT NULL,
  observed_at_seq  int  NOT NULL,
  caused_by_seq    int,
  attribution      text NOT NULL,
  explanation      text NOT NULL,
  evidence_seqs    int[] NOT NULL,
  PRIMARY KEY (run_id, idx)
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
