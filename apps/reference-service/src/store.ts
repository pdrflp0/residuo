import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Fault, Mode } from '@residuo/contracts';
import type pg from 'pg';
import { type ConsumerResult, consumeGuarded, consumeVulnerable, type Delivery, indexItem, type ItemView } from './consumers';
import { inTransaction, type Tx } from './db';

export const PG_POOL = Symbol('PG_POOL');

export interface NamespaceRow {
  ns: string;
  mode: Mode;
  fault: Fault;
}

const shortId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

const itemView = (row: { id: string; generation: number; revision: number; last_written_by: string; data?: unknown; updated_at?: Date }) => ({
  id: row.id,
  generation: row.generation,
  revision: row.revision,
  lastWrittenBy: row.last_written_by,
  ...(row.data !== undefined ? { data: row.data } : {}),
  ...(row.updated_at ? { updatedAt: row.updated_at.toISOString() } : {}),
});

@Injectable()
export class TargetStore implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onModuleDestroy() {
    await this.pool.end();
  }

  // ---------- namespaces ----------

  async createNamespace(ns: string, mode: Mode, fault: Fault): Promise<NamespaceRow> {
    const { rows } = await this.pool.query(
      `INSERT INTO namespaces (ns, mode, fault) VALUES ($1, $2, $3)
       ON CONFLICT (ns) DO NOTHING RETURNING ns, mode, fault`,
      [ns, mode, fault],
    );
    if (!rows[0]) throw new ConflictException({ outcome: 'NAMESPACE_EXISTS', ns });
    return rows[0];
  }

  async getNamespace(ns: string): Promise<NamespaceRow> {
    const { rows } = await this.pool.query(`SELECT ns, mode, fault FROM namespaces WHERE ns = $1`, [ns]);
    if (!rows[0]) throw new NotFoundException({ outcome: 'NAMESPACE_NOT_FOUND', ns });
    return rows[0];
  }

  /** Reset restrito: só apaga as linhas daquele namespace (cascade a partir de namespaces). */
  async deleteNamespace(ns: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`DELETE FROM namespaces WHERE ns = $1`, [ns]);
    return (rowCount ?? 0) > 0;
  }

  // ---------- registros ----------

  async createItem(ns: string, id: string, data: Record<string, unknown>) {
    await this.getNamespace(ns);
    return inTransaction(this.pool, async (tx) => {
      const gen = await tx.query(
        `INSERT INTO identities (ns, id, last_generation) VALUES ($1, $2, 1)
         ON CONFLICT (ns, id) DO UPDATE SET last_generation = identities.last_generation + 1
         RETURNING last_generation`,
        [ns, id],
      );
      const existing = await tx.query(`SELECT id, generation, revision, last_written_by FROM items WHERE ns = $1 AND id = $2`, [ns, id]);
      if (existing.rows[0]) {
        throw new ConflictException({ outcome: 'ALREADY_EXISTS', item: itemView(existing.rows[0]) });
      }
      const { rows } = await tx.query(
        `INSERT INTO items (ns, id, generation, revision, data, last_written_by)
         VALUES ($1, $2, $3, 1, $4, $5) RETURNING id, generation, revision, data, last_written_by, updated_at`,
        [ns, id, gen.rows[0].last_generation, data, `create:${shortId('op')}`],
      );
      await indexItem(tx, ns, id, rows[0].generation, rows[0].revision, data, rows[0].last_written_by);
      return { outcome: 'CREATED', item: itemView(rows[0]) };
    });
  }

  async getItem(ns: string, id: string) {
    const { rows } = await this.pool.query(
      `SELECT id, generation, revision, data, last_written_by, updated_at FROM items WHERE ns = $1 AND id = $2`,
      [ns, id],
    );
    if (!rows[0]) throw new NotFoundException({ outcome: 'NOT_FOUND', id });
    return { item: itemView(rows[0]) };
  }

  async deleteItem(ns: string, id: string, generation: number) {
    const space = await this.getNamespace(ns);
    return inTransaction(this.pool, async (tx) => {
      await tx.query(`SELECT 1 FROM identities WHERE ns = $1 AND id = $2 FOR UPDATE`, [ns, id]);
      const cur = await tx.query(`SELECT generation, revision, data FROM items WHERE ns = $1 AND id = $2 FOR UPDATE`, [ns, id]);
      const row = cur.rows[0];
      if (!row) throw new NotFoundException({ outcome: 'NOT_FOUND', id });
      if (row.generation !== generation) {
        throw new ConflictException({ outcome: 'GENERATION_MISMATCH', currentGeneration: row.generation, requestedGeneration: generation });
      }
      await tx.query(`DELETE FROM items WHERE ns = $1 AND id = $2`, [ns, id]);
      if (space.mode === 'guarded') {
        // invalidação na mesma transação: nenhum ponto derivado sobrevive à exclusão confirmada
        await tx.query(`DELETE FROM cache_entries WHERE ns = $1 AND id = $2`, [ns, id]);
        await tx.query(`DELETE FROM search_index WHERE ns = $1 AND id = $2`, [ns, id]);
      }
      const deletionId = shortId('del');
      const mechanism = space.mode === 'guarded' ? 'tombstone' : 'row-removed';
      await tx.query(
        `INSERT INTO deletions (ns, deletion_id, id, generation, revision, snapshot, mechanism, status, effective_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'effective', now())`,
        [ns, deletionId, id, row.generation, row.revision, row.data, mechanism],
      );
      return {
        outcome: 'DELETED',
        deletion: { deletionId, id, generation: row.generation, revision: row.revision, status: 'effective', mechanism },
      };
    });
  }

  async getDeletion(ns: string, deletionId: string) {
    const space = await this.getNamespace(ns);
    const { rows } = await this.pool.query(
      `SELECT deletion_id, id, generation, revision, mechanism, status, effective_at, restored_at, restore_id
         FROM deletions WHERE ns = $1 AND deletion_id = $2`,
      [ns, deletionId],
    );
    const d = rows[0];
    if (!d) throw new NotFoundException({ outcome: 'DELETION_NOT_FOUND', deletionId });
    const status = space.fault === 'confirm-pending' ? 'pending' : d.restored_at ? 'restored' : d.status;
    return {
      deletionId: d.deletion_id,
      id: d.id,
      generation: d.generation,
      revision: d.revision,
      mechanism: d.mechanism,
      status,
      effectiveAt: status === 'pending' ? null : d.effective_at,
      ...(d.restored_at ? { restoredAt: d.restored_at, restoreId: d.restore_id } : {}),
    };
  }

  async restoreItem(ns: string, id: string, deletionId: string, authorization?: { actor?: string; reason?: string }) {
    await this.getNamespace(ns);
    if (!authorization?.actor || !authorization.reason) {
      throw new ForbiddenException({ outcome: 'NOT_AUTHORIZED', detail: 'restauração exige ator e motivo registrados' });
    }
    return inTransaction(this.pool, async (tx) => {
      await tx.query(`SELECT 1 FROM identities WHERE ns = $1 AND id = $2 FOR UPDATE`, [ns, id]);
      const del = await tx.query(`SELECT * FROM deletions WHERE ns = $1 AND deletion_id = $2 AND id = $3 FOR UPDATE`, [ns, deletionId, id]);
      const d = del.rows[0];
      if (!d) throw new NotFoundException({ outcome: 'DELETION_NOT_FOUND', deletionId });
      if (d.restored_at) throw new ConflictException({ outcome: 'ALREADY_RESTORED', restoreId: d.restore_id });
      const exists = await tx.query(`SELECT 1 FROM items WHERE ns = $1 AND id = $2`, [ns, id]);
      if (exists.rowCount) throw new ConflictException({ outcome: 'ALREADY_EXISTS' });
      const restoreId = shortId('rst');
      const { rows } = await tx.query(
        `INSERT INTO items (ns, id, generation, revision, data, last_written_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, generation, revision, data, last_written_by, updated_at`,
        [ns, id, d.generation, d.revision + 1, d.snapshot, `restore:${restoreId}`],
      );
      await indexItem(tx, ns, id, rows[0].generation, rows[0].revision, d.snapshot, rows[0].last_written_by);
      await tx.query(
        `UPDATE deletions SET restored_at = now(), restore_id = $3, restored_by = $4, restore_reason = $5
          WHERE ns = $1 AND deletion_id = $2`,
        [ns, deletionId, restoreId, authorization.actor, authorization.reason],
      );
      return { outcome: 'RESTORED', restoreId, authorization: { actor: authorization.actor, reason: authorization.reason }, item: itemView(rows[0]) };
    });
  }

  // ---------- dados derivados (nível 3) ----------

  /** Leitura com cache: devolve a cópia em cache se houver; senão lê a fonte e guarda no cache. */
  async getCachedItem(ns: string, id: string) {
    await this.getNamespace(ns);
    const hit = await this.pool.query(`SELECT payload, cached_at FROM cache_entries WHERE ns = $1 AND id = $2`, [ns, id]);
    if (hit.rows[0]) return { source: 'cache', cachedAt: hit.rows[0].cached_at, item: hit.rows[0].payload };
    const { item } = await this.getItem(ns, id);
    await this.pool.query(`INSERT INTO cache_entries (ns, id, payload) VALUES ($1, $2, $3) ON CONFLICT (ns, id) DO UPDATE SET payload = EXCLUDED.payload, cached_at = now()`, [
      ns,
      id,
      item,
    ]);
    return { source: 'primary', item };
  }

  async getSearchItem(ns: string, id: string) {
    await this.getNamespace(ns);
    const { rows } = await this.pool.query(`SELECT * FROM search_index WHERE ns = $1 AND id = $2`, [ns, id]);
    if (!rows[0]) throw new NotFoundException({ outcome: 'NOT_FOUND', id });
    const r = rows[0];
    return { item: { id: r.id, generation: r.generation, revision: r.revision, title: r.title, lastWrittenBy: r.last_written_by } };
  }

  // ---------- backup (nível 3) ----------

  async takeSnapshot(ns: string) {
    await this.getNamespace(ns);
    const snapshotId = shortId('snp');
    const { rows } = await this.pool.query(
      `INSERT INTO snapshots (ns, snapshot_id, rows)
       SELECT $1, $2, COALESCE(jsonb_agg(jsonb_build_object('id', id, 'generation', generation, 'revision', revision, 'data', data)), '[]'::jsonb)
         FROM items WHERE ns = $1
       RETURNING jsonb_array_length(rows) AS count`,
      [ns, snapshotId],
    );
    return { outcome: 'SNAPSHOT_TAKEN', snapshotId, items: rows[0].count };
  }

  /**
   * Restaura um backup: o estado volta a ser o do momento do backup.
   * vulnerable: só isso — o que foi apagado depois do backup volta.
   * guarded: depois de restaurar, reaplica o registro de exclusões (que fica fora do backup).
   */
  async restoreSnapshot(ns: string, snapshotId: string) {
    const space = await this.getNamespace(ns);
    return inTransaction(this.pool, async (tx) => {
      const snap = await tx.query(`SELECT rows FROM snapshots WHERE ns = $1 AND snapshot_id = $2`, [ns, snapshotId]);
      if (!snap.rows[0]) throw new NotFoundException({ outcome: 'SNAPSHOT_NOT_FOUND', snapshotId });
      const opRef = `snapshot-restore:${snapshotId}`;
      await tx.query(`SELECT 1 FROM identities WHERE ns = $1 FOR UPDATE`, [ns]);
      await tx.query(`DELETE FROM items WHERE ns = $1`, [ns]);
      await tx.query(`DELETE FROM cache_entries WHERE ns = $1`, [ns]);
      const restored: { id: string; generation: number }[] = snap.rows[0].rows;
      for (const r of snap.rows[0].rows as { id: string; generation: number; revision: number; data: Record<string, unknown> }[]) {
        await tx.query(`INSERT INTO items (ns, id, generation, revision, data, last_written_by) VALUES ($1, $2, $3, $4, $5, $6)`, [
          ns,
          r.id,
          r.generation,
          r.revision,
          r.data,
          opRef,
        ]);
        await indexItem(tx, ns, r.id, r.generation, r.revision, r.data, opRef);
      }
      const reapplied: { id: string; generation: number; deletionId: string }[] = [];
      if (space.mode === 'guarded') {
        for (const r of restored) {
          const del = await tx.query(
            `SELECT deletion_id FROM deletions WHERE ns = $1 AND id = $2 AND generation = $3 AND restored_at IS NULL ORDER BY effective_at DESC LIMIT 1`,
            [ns, r.id, r.generation],
          );
          if (del.rows[0]) {
            await tx.query(`DELETE FROM items WHERE ns = $1 AND id = $2`, [ns, r.id]);
            await tx.query(`DELETE FROM search_index WHERE ns = $1 AND id = $2`, [ns, r.id]);
            reapplied.push({ id: r.id, generation: r.generation, deletionId: del.rows[0].deletion_id });
          }
        }
      }
      return { outcome: 'SNAPSHOT_RESTORED', snapshotId, opRef, restored: restored.length, reappliedDeletions: reapplied };
    });
  }

  // ---------- cliente offline e fila ----------

  async prepareUpdate(ns: string, input: { id: string; generation: number; baseRevision: number; data: Record<string, unknown> }) {
    await this.getNamespace(ns);
    const deliveryId = shortId('dlv');
    await this.pool.query(
      `INSERT INTO deliveries (ns, delivery_id, entity_id, generation, base_revision, data, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'prepared')`,
      [ns, deliveryId, input.id, input.generation, input.baseRevision, input.data],
    );
    return { deliveryId, entityId: input.id, generation: input.generation, baseRevision: input.baseRevision, status: 'prepared' };
  }

  async holdDelivery(ns: string, deliveryId: string) {
    const { rows } = await this.pool.query(
      `UPDATE deliveries SET status = 'held' WHERE ns = $1 AND delivery_id = $2 AND status = 'prepared'
       RETURNING delivery_id, entity_id, status`,
      [ns, deliveryId],
    );
    if (!rows[0]) await this.invalidDeliveryState(ns, deliveryId, 'prepared');
    return { deliveryId, entityId: rows[0].entity_id, status: rows[0].status };
  }

  /**
   * Libera uma entrega e devolve o resultado do consumidor na mesma resposta.
   * É isso que faz da chamada uma barreira: quando ela retorna, o consumidor terminou.
   */
  async consume(ns: string, deliveryId: string, kind: 'release' | 'redeliver') {
    const space = await this.getNamespace(ns);
    return inTransaction(this.pool, async (tx) => {
      const { rows } = await tx.query(`SELECT * FROM deliveries WHERE ns = $1 AND delivery_id = $2 FOR UPDATE`, [ns, deliveryId]);
      const d = rows[0];
      if (!d) throw new NotFoundException({ outcome: 'DELIVERY_NOT_FOUND', deliveryId });
      const allowed = kind === 'release' ? ['prepared', 'held'] : ['delivered'];
      if (!allowed.includes(d.status)) {
        throw new UnprocessableEntityException({ outcome: 'INVALID_DELIVERY_STATE', status: d.status, expected: allowed });
      }
      const delivery: Delivery = d;
      const consumer: ConsumerResult = space.mode === 'guarded' ? await consumeGuarded(tx, delivery) : await consumeVulnerable(tx, delivery);
      await this.markDelivered(tx, ns, deliveryId, consumer.outcome);
      return {
        deliveryId,
        entityId: d.entity_id,
        generation: d.generation,
        baseRevision: d.base_revision,
        deliveryCount: d.delivery_count + 1,
        consumer,
      };
    });
  }

  private async markDelivered(tx: Tx, ns: string, deliveryId: string, outcome: string) {
    await tx.query(
      `UPDATE deliveries SET status = 'delivered', delivery_count = delivery_count + 1, last_outcome = $3, delivered_at = now()
        WHERE ns = $1 AND delivery_id = $2`,
      [ns, deliveryId, outcome],
    );
  }

  private async invalidDeliveryState(ns: string, deliveryId: string, expected: string): Promise<never> {
    const { rows } = await this.pool.query(`SELECT status FROM deliveries WHERE ns = $1 AND delivery_id = $2`, [ns, deliveryId]);
    if (!rows[0]) throw new NotFoundException({ outcome: 'DELIVERY_NOT_FOUND', deliveryId });
    throw new UnprocessableEntityException({ outcome: 'INVALID_DELIVERY_STATE', status: rows[0].status, expected: [expected] });
  }
}

export type { ItemView };
