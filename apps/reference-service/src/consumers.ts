/**
 * Os dois consumidores de atualizações. Esta é a diferença inteira entre os modos.
 *
 * vulnerable: faz upsert por id. Se o registro foi apagado, o INSERT "acha" espaço livre
 *             e recria a linha com a geração antiga — o registro ressuscita.
 * guarded:    (1) inbox deduplica a entrega; (2) bloqueia a identidade para serializar com
 *             exclusões; (3) consulta o marcador de exclusão de (id, geração); (4) exige que
 *             a geração e a revisão-base batam com a linha atual. Atualização nunca cria linha.
 *             Toda recusa devolve um resultado explícito em vez de sumir em silêncio.
 */
import type { Tx } from './db';

export interface Delivery {
  ns: string;
  delivery_id: string;
  entity_id: string;
  generation: number;
  base_revision: number;
  data: Record<string, unknown>;
}

export interface ItemView {
  id: string;
  generation: number;
  revision: number;
  lastWrittenBy: string;
}

export type ConsumerOutcome =
  | 'UPSERT_INSERTED'
  | 'UPSERT_UPDATED'
  | 'APPLIED'
  | 'DUPLICATE_IGNORED'
  | 'REJECTED_DELETED'
  | 'REJECTED_NOT_FOUND'
  | 'REJECTED_GENERATION_MISMATCH'
  | 'REJECTED_STALE_REVISION';

export interface ConsumerResult {
  outcome: ConsumerOutcome;
  wrote: boolean;
  item?: ItemView;
  conflict?: Record<string, unknown>;
}

const opRef = (d: Delivery) => `delivery:${d.delivery_id}`;

export async function consumeVulnerable(tx: Tx, d: Delivery): Promise<ConsumerResult> {
  const { rows } = await tx.query(
    `INSERT INTO items (ns, id, generation, revision, data, last_written_by, updated_at)
     VALUES ($1, $2, $3, $4::int + 1, $5, $6, now())
     ON CONFLICT (ns, id) DO UPDATE
       SET data = EXCLUDED.data,
           revision = items.revision + 1,
           last_written_by = EXCLUDED.last_written_by,
           updated_at = now()
     RETURNING id, generation, revision, last_written_by, (xmax = 0) AS inserted`,
    [d.ns, d.entity_id, d.generation, d.base_revision, d.data, opRef(d)],
  );
  const row = rows[0];
  return {
    outcome: row.inserted ? 'UPSERT_INSERTED' : 'UPSERT_UPDATED',
    wrote: true,
    item: { id: row.id, generation: row.generation, revision: row.revision, lastWrittenBy: row.last_written_by },
  };
}

export async function consumeGuarded(tx: Tx, d: Delivery): Promise<ConsumerResult> {
  const fresh = await tx.query(
    `INSERT INTO inbox (ns, delivery_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING delivery_id`,
    [d.ns, d.delivery_id],
  );
  if (fresh.rowCount === 0) return { outcome: 'DUPLICATE_IGNORED', wrote: false };

  const result = await decideGuarded(tx, d);
  await tx.query(`UPDATE inbox SET outcome = $3 WHERE ns = $1 AND delivery_id = $2`, [d.ns, d.delivery_id, result.outcome]);
  return result;
}

async function decideGuarded(tx: Tx, d: Delivery): Promise<ConsumerResult> {
  // Mesmo lock usado por criar/excluir/restaurar: a decisão abaixo não corre contra uma exclusão.
  await tx.query(`SELECT 1 FROM identities WHERE ns = $1 AND id = $2 FOR UPDATE`, [d.ns, d.entity_id]);

  const tomb = await tx.query(
    `SELECT deletion_id, revision, effective_at FROM deletions
      WHERE ns = $1 AND id = $2 AND generation = $3 AND restored_at IS NULL
      ORDER BY effective_at DESC LIMIT 1`,
    [d.ns, d.entity_id, d.generation],
  );
  if (tomb.rowCount) {
    const t = tomb.rows[0];
    return {
      outcome: 'REJECTED_DELETED',
      wrote: false,
      conflict: { deletionId: t.deletion_id, deletedAtRevision: t.revision, deletedAt: t.effective_at, generation: d.generation },
    };
  }

  const cur = await tx.query(`SELECT id, generation, revision, last_written_by FROM items WHERE ns = $1 AND id = $2 FOR UPDATE`, [
    d.ns,
    d.entity_id,
  ]);
  const row = cur.rows[0];
  if (!row) return { outcome: 'REJECTED_NOT_FOUND', wrote: false };
  if (row.generation !== d.generation) {
    return { outcome: 'REJECTED_GENERATION_MISMATCH', wrote: false, conflict: { currentGeneration: row.generation, updateGeneration: d.generation } };
  }
  if (row.revision !== d.base_revision) {
    return { outcome: 'REJECTED_STALE_REVISION', wrote: false, conflict: { currentRevision: row.revision, baseRevision: d.base_revision } };
  }

  const { rows } = await tx.query(
    `UPDATE items SET data = $3, revision = revision + 1, last_written_by = $4, updated_at = now()
      WHERE ns = $1 AND id = $2
      RETURNING id, generation, revision, last_written_by`,
    [d.ns, d.entity_id, d.data, opRef(d)],
  );
  const u = rows[0];
  return { outcome: 'APPLIED', wrote: true, item: { id: u.id, generation: u.generation, revision: u.revision, lastWrittenBy: u.last_written_by } };
}
