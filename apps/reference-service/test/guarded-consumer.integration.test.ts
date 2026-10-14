/**
 * Testes diretos do serviço (sem o engine) para regras do consumidor protegido
 * que os cenários não exercitam sozinhos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newNamespace, startReferenceService } from './harness';

let svc: Awaited<ReturnType<typeof startReferenceService>>;
beforeAll(async () => {
  svc = await startReferenceService();
});
afterAll(async () => {
  await svc?.close();
});

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(svc.url + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function setup(mode: 'guarded' | 'vulnerable') {
  const ns = newNamespace('direct');
  await api('POST', '/namespaces', { namespace: ns, mode });
  await api('POST', `/ns/${ns}/items`, { id: 'item-1', data: { v: 0 } });
  return ns;
}

const prepare = async (ns: string, baseRevision: number) =>
  (await api('POST', `/ns/${ns}/client/updates`, { id: 'item-1', generation: 1, baseRevision, data: { v: baseRevision } })).body.deliveryId as string;

describe('consumidor guarded', () => {
  it('rejeita explicitamente uma edição preparada sobre revisão antiga (conflito)', async () => {
    const ns = await setup('guarded');
    const a = await prepare(ns, 1);
    const b = await prepare(ns, 1);
    expect((await api('POST', `/ns/${ns}/deliveries/${a}/release`)).body.consumer.outcome).toBe('APPLIED');
    const second = await api('POST', `/ns/${ns}/deliveries/${b}/release`);
    expect(second.status).toBe(409);
    expect(second.body.consumer).toMatchObject({ outcome: 'REJECTED_STALE_REVISION', wrote: false, conflict: { currentRevision: 2, baseRevision: 1 } });
  });

  it('uma edição da geração antiga não toca a geração nova', async () => {
    const ns = await setup('guarded');
    const old = await prepare(ns, 1);
    await api('DELETE', `/ns/${ns}/items/item-1?generation=1`);
    const g2 = await api('POST', `/ns/${ns}/items`, { id: 'item-1', data: { v: 'novo' } });
    expect(g2.body.item.generation).toBe(2);
    const res = await api('POST', `/ns/${ns}/deliveries/${old}/release`);
    expect(res.body.consumer.outcome).toBe('REJECTED_DELETED');
    const now = await api('GET', `/ns/${ns}/items/item-1`);
    expect(now.body.item).toMatchObject({ generation: 2, revision: 1 });
  });

  it('restauração exige ator e motivo', async () => {
    const ns = await setup('guarded');
    const del = await api('DELETE', `/ns/${ns}/items/item-1?generation=1`);
    const res = await api('POST', `/ns/${ns}/items/item-1/restore`, { deletionId: del.body.deletion.deletionId });
    expect(res.status).toBe(403);
  });

  /**
   * Corrida real (sem barreiras): edição e exclusão disparadas juntas, várias vezes.
   * Não é replay determinístico — é uma verificação de que o lock por identidade
   * mantém o invariante em qualquer ordem que o Postgres escolher.
   */
  it('sob corrida real entre liberação e exclusão, a geração excluída nunca fica visível', async () => {
    for (let i = 0; i < 15; i++) {
      const ns = await setup('guarded');
      const d = await prepare(ns, 1);
      const [rel, del] = await Promise.all([
        api('POST', `/ns/${ns}/deliveries/${d}/release`),
        api('DELETE', `/ns/${ns}/items/item-1?generation=1`),
      ]);
      expect(del.status).toBe(200);
      // Com o lock por identidade, só há duas ordens possíveis: a edição entra antes da exclusão,
      // ou encontra o marcador de exclusão. REJECTED_NOT_FOUND indicaria decisão sem o lock.
      expect(['APPLIED', 'REJECTED_DELETED']).toContain(rel.body.consumer.outcome);
      const read = await api('GET', `/ns/${ns}/items/item-1`);
      expect(read.status).toBe(404);
      await api('DELETE', `/namespaces/${ns}`);
    }
  });
});
