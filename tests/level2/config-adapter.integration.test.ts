/**
 * Nível 2: o adapter genérico (residuo.json) contra sistemas reais.
 */
import { AdapterError, type Mode, type StepObservation } from '@residuo/contracts';
import { ConfigHttpAdapter, exploreOrders, ReferenceHttpAdapter, SCENARIOS } from '@residuo/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig, ns, runScenario, startNotes, startReference } from './harness';

let notes: Awaited<ReturnType<typeof startNotes>>;
let ref: Awaited<ReturnType<typeof startReference>>;

beforeAll(async () => {
  [notes, ref] = await Promise.all([startNotes(), startReference()]);
});
afterAll(async () => {
  await Promise.all([notes?.close(), ref?.close()]);
});

const notesAdapter = (strategy: 'upsert' | 'tombstone') =>
  new ConfigHttpAdapter(loadConfig('examples/notes-sync/residuo.json', notes.url), { strategy });

describe('residuo.json do serviço de referência = adapter escrito à mão', () => {
  const signature = (steps: StepObservation[]) =>
    steps.map((s) => [s.stepId, s.status, s.facts.writeOutcome, s.facts.wrote, s.facts.visible, s.facts.observedGeneration, s.facts.confirmed]);

  for (const scenario of SCENARIOS) {
    for (const mode of ['vulnerable', 'guarded'] as Mode[]) {
      it(`${scenario.id} / ${mode}: mesmas etapas, mesmos fatos e mesmo veredito`, async () => {
        const viaCode = await runScenario(new ReferenceHttpAdapter(ref.url), scenario.id, mode);
        const viaConfig = await runScenario(new ConfigHttpAdapter(loadConfig('examples/reference-service.residuo.json', ref.url), { mode }), scenario.id, 'external');
        expect(signature(viaConfig.steps)).toEqual(signature(viaCode.steps));
        expect(viaConfig.verdict.result).toBe(viaCode.verdict.result);
        expect(viaConfig.verdict.violations.map((v) => [v.observedAtSeq, v.causedBySeq, v.attribution])).toEqual(
          viaCode.verdict.violations.map((v) => [v.observedAtSeq, v.causedBySeq, v.attribution]),
        );
      });
    }
  }
});

describe('app de exemplo notes-sync (formato de API diferente)', () => {
  it('upsert: detecta a ressurreição e atribui a causa pela procedência do próprio app', async () => {
    const r = await runScenario(notesAdapter('upsert'), 'held-update-after-delete', 'external');
    expect(r.verdict.result).toBe('VIOLATION');
    const v = r.verdict.violations[0]!;
    expect(v.attribution).toBe('provenance');
    expect(r.steps.find((s) => s.seq === v.causedBySeq)?.facts.writeOutcome).toBe('recreated');
  });

  it('tombstone: mesma sequência sem violação, com recusa explícita (409)', async () => {
    const r = await runScenario(notesAdapter('tombstone'), 'held-update-after-delete', 'external');
    expect(r.verdict.result).toBe('NO_VIOLATION_OBSERVED');
    const release = r.steps.find((s) => s.stepId === 'release')!;
    expect(release.exchange?.response?.status).toBe(409);
    expect(release.facts).toMatchObject({ writeOutcome: 'rejected', wrote: false });
  });

  it('"hold": "implicit" é registrado como tal, sem chamada inventada', async () => {
    const r = await runScenario(notesAdapter('upsert'), 'held-update-after-delete', 'external');
    const hold = r.steps.find((s) => s.stepId === 'hold')!;
    expect(hold.status).toBe('ok');
    expect(hold.exchange?.response).toBeUndefined();
    expect(hold.facts.writeOutcome).toBe('HELD (implícito)');
  });

  it('capacidade ausente (restauração) vira INCONCLUSIVE, nunca aprovação', async () => {
    const adapter = notesAdapter('upsert');
    expect(adapter.describe().capabilities).not.toContain('restore-entity');
    const r = await runScenario(adapter, 'authorized-restore', 'external');
    expect(r.steps.find((s) => s.stepId === 'restore')?.status).toBe('unsupported');
    expect(r.verdict.result).toBe('INCONCLUSIVE');
  });

  it('404 de outra causa (tenant inexistente) não é confundido com "registro ausente"', async () => {
    await expect(notesAdapter('upsert').inspectEntity(ns('nobody'), 'item-17', { timeoutMs: 2000 })).rejects.toBeInstanceOf(AdapterError);
  });
});

describe('exploração de ordens de entrega', () => {
  it('upsert: encontra violações e reduz até "exclusão → liberar edição 1"', async () => {
    const r = await exploreOrders({ adapter: notesAdapter('upsert'), mode: 'external', seed: 1, namespacePrefix: ns('exp') });
    expect(r.totalOrders).toBe(12);
    expect(r.violations.length).toBeGreaterThan(0);
    expect(r.minimal?.order).toEqual(['delete', 'release-1']);
    expect(r.minimal?.verdict.result).toBe('VIOLATION');
  });

  it('tombstone: nenhuma das 12 ordens viola', async () => {
    const r = await exploreOrders({ adapter: notesAdapter('tombstone'), mode: 'external', seed: 1, namespacePrefix: ns('exp') });
    expect(r.explored).toHaveLength(12);
    expect(r.violations).toEqual([]);
    expect(r.inconclusive).toEqual([]);
    expect(r.minimal).toBeUndefined();
  });

  it('o orçamento limita as ordens e a semente decide quais (reprodutível)', async () => {
    const a = await exploreOrders({ adapter: notesAdapter('tombstone'), mode: 'external', seed: 7, budget: 4, namespacePrefix: ns('exp') });
    const b = await exploreOrders({ adapter: notesAdapter('tombstone'), mode: 'external', seed: 7, budget: 4, namespacePrefix: ns('exp') });
    expect(a.explored.map((r) => r.order)).toEqual(b.explored.map((r) => r.order));
    expect(a.explored).toHaveLength(4);
  });
});
