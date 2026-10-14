/**
 * notes-sync — app de exemplo para integrar com o Resíduo.
 *
 * Uma API de notas comum (criar, ler, excluir) mais o endpoint que clientes offline usam para
 * enviar mudanças guardadas: POST /sync/push. A estratégia de sincronização é escolhida por tenant:
 *   upsert     → aplica a mudança com INSERT … ON CONFLICT: recria notas excluídas (o bug)
 *   tombstone  → inbox + lock + marcador de exclusão por geração: recusa mudanças de notas excluídas
 *
 * Ganchos de teste (/__residuo/*) só existem com RESIDUO_HOOKS=1. Eles simulam o cliente offline
 * (guardar uma mudança e enviá-la depois) e criam/removem tenants de teste. É esse o "ponto de
 * controle" que um sistema precisa oferecer para o Resíduo segurar e soltar entregas.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import pg from 'pg';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tenants (tenant text PRIMARY KEY, strategy text NOT NULL CHECK (strategy IN ('upsert', 'tombstone')));
CREATE TABLE IF NOT EXISTS note_ids (
  tenant text NOT NULL REFERENCES tenants ON DELETE CASCADE, id text NOT NULL, last_generation int NOT NULL, PRIMARY KEY (tenant, id));
CREATE TABLE IF NOT EXISTS notes (
  tenant text NOT NULL REFERENCES tenants ON DELETE CASCADE, id text NOT NULL, generation int NOT NULL, version int NOT NULL,
  title text NOT NULL, body text NOT NULL, last_write text NOT NULL, PRIMARY KEY (tenant, id));
CREATE TABLE IF NOT EXISTS deletions (
  tenant text NOT NULL REFERENCES tenants ON DELETE CASCADE, deletion_id text NOT NULL, id text NOT NULL, generation int NOT NULL,
  version int NOT NULL, deleted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant, deletion_id));
CREATE TABLE IF NOT EXISTS sync_inbox (tenant text NOT NULL REFERENCES tenants ON DELETE CASCADE, change_id text NOT NULL, PRIMARY KEY (tenant, change_id));
CREATE TABLE IF NOT EXISTS client_queue (
  tenant text NOT NULL REFERENCES tenants ON DELETE CASCADE, change_id text NOT NULL, note_id text NOT NULL, generation int NOT NULL,
  base_version int NOT NULL, title text NOT NULL, body text NOT NULL, sends int NOT NULL DEFAULT 0, PRIMARY KEY (tenant, change_id));
`;

interface Change {
  changeId: string;
  noteId: string;
  generation: number;
  baseVersion: number;
  title: string;
  body: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(String(body.code ?? status));
  }
}

const noteView = (r: any) => ({ id: r.id, generation: r.generation, version: r.version, title: r.title, body: r.body, lastWrite: r.last_write });

export async function ensureDatabase(url: string) {
  const u = new URL(url);
  const name = u.pathname.slice(1);
  u.pathname = '/postgres';
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  try {
    const { rowCount } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await c.query(`CREATE DATABASE ${name}`).catch((e) => (e.code === '42P04' ? undefined : Promise.reject(e)));
  } finally {
    await c.end();
  }
}

export async function createNotesServer(opts: { databaseUrl: string; hooks: boolean }): Promise<{ server: Server; close: () => Promise<void> }> {
  await ensureDatabase(opts.databaseUrl);
  const pool = new pg.Pool({ connectionString: opts.databaseUrl, max: 10 });
  pool.on('error', () => undefined);
  await pool.query(SCHEMA);

  async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const r = await fn(c);
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  async function strategyOf(tenant: string): Promise<'upsert' | 'tombstone'> {
    const { rows } = await pool.query('SELECT strategy FROM tenants WHERE tenant = $1', [tenant]);
    if (!rows[0]) throw new HttpError(404, { code: 'TENANT_NOT_FOUND', tenant });
    return rows[0].strategy;
  }

  /** O coração do exemplo: como uma mudança offline é aplicada. */
  async function push(tenant: string, ch: Change): Promise<[number, Record<string, unknown>]> {
    const strategy = await strategyOf(tenant);
    const write = `change:${ch.changeId}`;
    if (strategy === 'upsert') {
      const { rows } = await pool.query(
        `INSERT INTO notes (tenant, id, generation, version, title, body, last_write) VALUES ($1, $2, $3, $4::int + 1, $5, $6, $7)
         ON CONFLICT (tenant, id) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, version = notes.version + 1, last_write = EXCLUDED.last_write
         RETURNING *, (xmax = 0) AS inserted`,
        [tenant, ch.noteId, ch.generation, ch.baseVersion, ch.title, ch.body, write],
      );
      return [200, { result: rows[0].inserted ? 'recreated' : 'updated', note: noteView(rows[0]) }];
    }
    return tx(async (c) => {
      const fresh = await c.query('INSERT INTO sync_inbox VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING change_id', [tenant, ch.changeId]);
      if (!fresh.rowCount) return [200, { result: 'duplicate' }];
      await c.query('SELECT 1 FROM note_ids WHERE tenant = $1 AND id = $2 FOR UPDATE', [tenant, ch.noteId]);
      const tomb = await c.query('SELECT deletion_id FROM deletions WHERE tenant = $1 AND id = $2 AND generation = $3', [tenant, ch.noteId, ch.generation]);
      if (tomb.rowCount) return [409, { result: 'rejected', reason: 'deleted', deletionId: tomb.rows[0].deletion_id }];
      const cur = await c.query('SELECT * FROM notes WHERE tenant = $1 AND id = $2 FOR UPDATE', [tenant, ch.noteId]);
      const n = cur.rows[0];
      if (!n) return [409, { result: 'rejected', reason: 'not-found' }];
      if (n.generation !== ch.generation || n.version !== ch.baseVersion) return [409, { result: 'rejected', reason: 'stale', currentVersion: n.version }];
      const { rows } = await c.query(
        `UPDATE notes SET title = $3, body = $4, version = version + 1, last_write = $5 WHERE tenant = $1 AND id = $2 RETURNING *`,
        [tenant, ch.noteId, ch.title, ch.body, write],
      );
      return [200, { result: 'updated', note: noteView(rows[0]) }];
    });
  }

  async function route(method: string, path: string, tenant: string | undefined, body: any): Promise<[number, unknown]> {
    let m: RegExpMatchArray | null;

    // ---------- ganchos de teste (somente com RESIDUO_HOOKS=1) ----------
    if (path.startsWith('/__residuo/')) {
      if (!opts.hooks) throw new HttpError(404, { code: 'NOT_FOUND' });
      if (method === 'POST' && path === '/__residuo/tenants') {
        if (!/^rsd-[a-z0-9-]{1,80}$/.test(body?.tenant ?? '')) throw new HttpError(400, { code: 'INVALID_TEST_TENANT' });
        await pool.query('INSERT INTO tenants VALUES ($1, $2)', [body.tenant, body.strategy ?? 'upsert']).catch((e) => {
          throw e.code === '23505' ? new HttpError(409, { code: 'TENANT_EXISTS' }) : new HttpError(400, { code: 'INVALID_STRATEGY' });
        });
        return [201, { tenant: body.tenant, strategy: body.strategy ?? 'upsert' }];
      }
      if (method === 'DELETE' && (m = path.match(/^\/__residuo\/tenants\/(rsd-[a-z0-9-]{1,80})$/))) {
        const { rowCount } = await pool.query('DELETE FROM tenants WHERE tenant = $1', [m[1]]);
        return [rowCount ? 200 : 404, { tenant: m[1] }];
      }
      if (!tenant) throw new HttpError(400, { code: 'MISSING_TENANT' });
      if (method === 'POST' && path === '/__residuo/client-queue') {
        const changeId = `chg_${randomUUID().slice(0, 12)}`;
        await strategyOf(tenant);
        await pool.query('INSERT INTO client_queue (tenant, change_id, note_id, generation, base_version, title, body) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
          tenant,
          changeId,
          body.noteId,
          body.generation,
          body.baseVersion,
          body.title,
          body.body,
        ]);
        return [201, { changeId, status: 'queued' }];
      }
      if (method === 'POST' && (m = path.match(/^\/__residuo\/client-queue\/([\w-]+)\/(send|resend)$/))) {
        const { rows } = await pool.query('SELECT * FROM client_queue WHERE tenant = $1 AND change_id = $2', [tenant, m[1]]);
        const q = rows[0];
        if (!q) throw new HttpError(404, { code: 'CHANGE_NOT_FOUND' });
        if (m[2] === 'send' ? q.sends > 0 : q.sends === 0) throw new HttpError(422, { code: m[2] === 'send' ? 'ALREADY_SENT' : 'NOT_SENT_YET' });
        await pool.query('UPDATE client_queue SET sends = sends + 1 WHERE tenant = $1 AND change_id = $2', [tenant, m[1]]);
        return push(tenant, { changeId: q.change_id, noteId: q.note_id, generation: q.generation, baseVersion: q.base_version, title: q.title, body: q.body });
      }
      throw new HttpError(404, { code: 'NOT_FOUND' });
    }

    // ---------- API do app ----------
    if (!tenant) throw new HttpError(400, { code: 'MISSING_TENANT' });
    if (method === 'POST' && path === '/notes') {
      if (!/^[a-z0-9-]{1,64}$/.test(body?.id ?? '')) throw new HttpError(400, { code: 'INVALID_ID' });
      await strategyOf(tenant);
      return tx(async (c) => {
        const gen = await c.query(
          `INSERT INTO note_ids VALUES ($1, $2, 1) ON CONFLICT (tenant, id) DO UPDATE SET last_generation = note_ids.last_generation + 1 RETURNING last_generation`,
          [tenant, body.id],
        );
        const exists = await c.query('SELECT 1 FROM notes WHERE tenant = $1 AND id = $2', [tenant, body.id]);
        if (exists.rowCount) throw new HttpError(409, { code: 'NOTE_EXISTS' });
        const { rows } = await c.query('INSERT INTO notes VALUES ($1, $2, $3, 1, $4, $5, $6) RETURNING *', [
          tenant,
          body.id,
          gen.rows[0].last_generation,
          String(body.title ?? ''),
          String(body.body ?? ''),
          `create:${randomUUID().slice(0, 12)}`,
        ]);
        return [201, noteView(rows[0])];
      });
    }
    if (method === 'GET' && (m = path.match(/^\/notes\/([a-z0-9-]{1,64})$/))) {
      await strategyOf(tenant);
      const { rows } = await pool.query('SELECT * FROM notes WHERE tenant = $1 AND id = $2', [tenant, m[1]]);
      return rows[0] ? [200, noteView(rows[0])] : [404, { code: 'NOTE_NOT_FOUND' }];
    }
    if (method === 'DELETE' && (m = path.match(/^\/notes\/([a-z0-9-]{1,64})$/))) {
      await strategyOf(tenant);
      const id = m[1]!;
      return tx(async (c) => {
        await c.query('SELECT 1 FROM note_ids WHERE tenant = $1 AND id = $2 FOR UPDATE', [tenant, id]);
        const { rows } = await c.query('DELETE FROM notes WHERE tenant = $1 AND id = $2 RETURNING *', [tenant, id]);
        if (!rows[0]) return [404, { code: 'NOTE_NOT_FOUND' }];
        const deletionId = `del_${randomUUID().slice(0, 12)}`;
        await c.query('INSERT INTO deletions (tenant, deletion_id, id, generation, version) VALUES ($1, $2, $3, $4, $5)', [
          tenant,
          deletionId,
          id,
          rows[0].generation,
          rows[0].version,
        ]);
        return [200, { deletionId, id, generation: rows[0].generation, version: rows[0].version }];
      });
    }
    if (method === 'GET' && (m = path.match(/^\/deletions\/([\w-]+)$/))) {
      await strategyOf(tenant);
      const { rows } = await pool.query('SELECT * FROM deletions WHERE tenant = $1 AND deletion_id = $2', [tenant, m[1]]);
      return rows[0] ? [200, { deletionId: m[1], status: 'effective', deletedAt: rows[0].deleted_at }] : [404, { code: 'DELETION_NOT_FOUND' }];
    }
    if (method === 'POST' && path === '/sync/push') return push(tenant, body as Change);
    throw new HttpError(404, { code: 'NOT_FOUND' });
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : undefined;
      const tenant = req.headers['x-tenant'];
      const [status, payload] = await route(req.method ?? 'GET', new URL(req.url ?? '/', 'http://x').pathname, typeof tenant === 'string' ? tenant : undefined, body);
      send(status, payload);
    } catch (err) {
      if (err instanceof HttpError) send(err.status, err.body);
      else send(500, { code: 'INTERNAL', message: (err as Error).message });
    }
  });

  return {
    server,
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      await pool.end();
    },
  };
}
