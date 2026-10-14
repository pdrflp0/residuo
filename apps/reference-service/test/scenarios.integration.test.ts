/**
 * Integração real: engine -> HTTP -> serviço de referência -> Postgres.
 * Nenhum mock: se o consumidor não recriar a linha, o teste do modo vulnerable falha.
 */
import { AdapterError, type StepObservation } from '@residuo/contracts';
import { executeScenario, getScenario } from '@residuo/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config, newNamespace, run, startReferenceService } from './harness';

let svc: Awaited<ReturnType<typeof startReferenceService>>;
beforeAll(async () => {
  svc = await startReferenceService();
});
afterAll(async () => {
  await svc?.close();
});

const outcome = (steps: { stepId: string; facts: { writeOutcome?: string } }[], id: string) => steps.find((s) => s.stepId === id)?.facts.writeOutcome;

describe('atualização retida após exclusão confirmada', () => {
  it('vulnerable: o upsert recria a geração excluída e o engine aponta a liberação como causa', async () => {
    const r = await run(svc.adapter, config('held-update-after-delete', 'vulnerable'));
    expect(r.entityId).toBe('item-17');
    expect(r.verdict.result).toBe('VIOLATION');
    expect(outcome(r.steps, 'release')).toBe('UPSERT_INSERTED');
    const v = r.verdict.violations[0]!;
    expect(v).toMatchObject({ generation: 1, attribution: 'provenance' });
    expect(r.steps.find((s) => s.seq === v.causedBySeq)?.stepId).toBe('release');
    expect(r.steps.find((s) => s.seq === v.observedAtSeq)?.stepId).toBe('inspect-after');
  });

  it('guarded: a mesma sequência não observa violação e a edição recebe rejeição explícita', async () => {
    const r = await run(svc.adapter, config('held-update-after-delete', 'guarded'));
    expect(r.verdict.result).toBe('NO_VIOLATION_OBSERVED');
    expect(outcome(r.steps, 'release')).toBe('REJECTED_DELETED');
    expect(r.steps.find((s) => s.stepId === 'release')?.exchange?.response?.status).toBe(409);
    expect(r.verdict.checkedPoints.filter((p) => p.afterConfirmation).every((p) => !p.visible)).toBe(true);
  });

  it('registra geração, revisão-base, confirmação e ordem lógica', async () => {
    const r = await run(svc.adapter, config('held-update-after-delete', 'guarded'));
    expect(r.steps.map((s) => s.stepId)).toEqual([
      'create',
      'prepare',
      'hold',
      'inspect-before',
      'delete',
      'confirm',
      'inspect-deleted',
      'release',
      'inspect-after',
    ]);
    expect(r.steps.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.steps[1]!.facts).toMatchObject({ generation: 1, baseRevision: 1 });
    expect(r.steps[5]!.facts).toMatchObject({ confirmed: true, confirmationStatus: 'effective', mechanism: 'tombstone' });
    expect(r.verdict.confirmationSeq).toBe(6);
  });
});

describe('replay da mesma atualização após exclusão', () => {
  it('vulnerable: a reentrega ressuscita o registro', async () => {
    const r = await run(svc.adapter, config('replay-after-delete', 'vulnerable'));
    expect(r.verdict.result).toBe('VIOLATION');
    expect(outcome(r.steps, 'replay')).toBe('UPSERT_INSERTED');
  });

  it('guarded: o inbox ignora a reentrega explicitamente', async () => {
    const r = await run(svc.adapter, config('replay-after-delete', 'guarded'));
    expect(r.verdict.result).toBe('NO_VIOLATION_OBSERVED');
    expect(outcome(r.steps, 'release')).toBe('APPLIED');
    expect(outcome(r.steps, 'replay')).toBe('DUPLICATE_IGNORED');
  });
});

describe('controle: nova geração legítima', () => {
  it.each(['vulnerable', 'guarded'] as const)('%s: g2 criada explicitamente não é classificada como g1 ressuscitada', async (mode) => {
    const r = await run(svc.adapter, config('new-generation-control', mode));
    expect(r.verdict.result).toBe('POLICY_ALLOWED');
    expect(r.verdict.violations).toEqual([]);
    expect(r.steps.find((s) => s.stepId === 'recreate')?.facts.generation).toBe(2);
    expect(r.steps.find((s) => s.stepId === 'inspect-after')?.facts.observedGeneration).toBe(2);
  });
});

describe('restauração autorizada depende da política declarada', () => {
  it('explicit-restore: POLICY_ALLOWED com evidência da autorização', async () => {
    const r = await run(svc.adapter, config('authorized-restore', 'guarded', { policy: 'explicit-restore' }));
    expect(r.verdict.result).toBe('POLICY_ALLOWED');
    expect(r.verdict.allowances[0]).toMatchObject({ kind: 'authorized-restore', generation: 1 });
  });

  it('a autorização usada no veredito é a que o alvo registrou e devolveu', async () => {
    const r = await run(svc.adapter, config('authorized-restore', 'guarded', { policy: 'explicit-restore' }));
    const restore = r.steps.find((s) => s.stepId === 'restore')!;
    expect((restore.exchange?.response?.body as { authorization: unknown }).authorization).toEqual(restore.facts.authorization);
  });

  it('delete-wins: a mesma restauração é VIOLATION', async () => {
    const r = await run(svc.adapter, config('authorized-restore', 'guarded', { policy: 'delete-wins' }));
    expect(r.verdict.result).toBe('VIOLATION');
  });
});

describe('nível 3: backup restaurado', () => {
  it('vulnerable: o restore traz a geração excluída de volta, e a causa é o próprio restore', async () => {
    const r = await run(svc.adapter, config('backup-restore-after-delete', 'vulnerable'));
    expect(r.verdict.result).toBe('VIOLATION');
    const v = r.verdict.violations[0]!;
    expect(v.attribution).toBe('provenance');
    expect(r.steps.find((s) => s.seq === v.causedBySeq)?.stepId).toBe('restore-snapshot');
    expect(r.steps.find((s) => s.stepId === 'restore-snapshot')?.facts.reappliedDeletions).toBe(0);
  });

  it('guarded: depois do restore, o registro de exclusões é reaplicado', async () => {
    const r = await run(svc.adapter, config('backup-restore-after-delete', 'guarded'));
    expect(r.verdict.result).toBe('NO_VIOLATION_OBSERVED');
    expect(r.steps.find((s) => s.stepId === 'restore-snapshot')?.facts.reappliedDeletions).toBe(1);
  });
});

describe('nível 3: cache e índice de busca', () => {
  it('vulnerable: some do banco, mas sobrevive no cache e no índice (duas violações, "dado derivado")', async () => {
    const r = await run(svc.adapter, config('derived-data-after-delete', 'vulnerable'));
    expect(r.verdict.result).toBe('VIOLATION');
    expect(r.steps.find((s) => s.stepId === 'inspect-primary')?.facts.visible).toBe(false);
    expect(r.verdict.violations.map((v) => [v.observationPoint, v.attribution])).toEqual([
      ['cache', 'stale-derived'],
      ['search', 'stale-derived'],
    ]);
  });

  it('guarded: a exclusão invalida cache e índice na mesma transação', async () => {
    const r = await run(svc.adapter, config('derived-data-after-delete', 'guarded'));
    expect(r.verdict.result).toBe('NO_VIOLATION_OBSERVED');
    expect(r.verdict.checkedPoints.filter((p) => p.afterConfirmation).map((p) => [p.observationPoint ?? 'primary', p.visible])).toEqual([
      ['primary', false],
      ['cache', false],
      ['search', false],
    ]);
  });
});

describe('falhas viram INCONCLUSIVE, nunca aprovação', () => {
  it('confirmação indisponível (503)', async () => {
    const r = await run(svc.adapter, config('held-update-after-delete', 'vulnerable', { fault: 'confirm-unavailable' }));
    expect(r.verdict.result).toBe('INCONCLUSIVE');
    expect(r.steps.find((s) => s.stepId === 'confirm')?.status).toBe('failed');
    expect(r.steps.filter((s) => s.status === 'skipped').map((s) => s.stepId)).toEqual(['inspect-deleted', 'release', 'inspect-after']);
  });

  it('confirmação que nunca fica "effective"', async () => {
    // mesmo no modo vulnerable (que ressuscita), sem confirmação não há conclusão
    const r = await run(svc.adapter, config('held-update-after-delete', 'vulnerable', { fault: 'confirm-pending' }));
    expect(r.verdict.result).toBe('INCONCLUSIVE');
    expect(r.verdict.violations).toEqual([]);
    expect(r.verdict.inconclusiveReasons[0]).toMatch(/pending/);
  });

  it('leitura sem resposta dentro do tempo limite', async () => {
    const r = await run(svc.adapter, config('held-update-after-delete', 'guarded', { fault: 'inspect-hang', timeoutMs: 300 }));
    expect(r.verdict.result).toBe('INCONCLUSIVE');
    expect(r.steps.find((s) => s.stepId === 'inspect-before')?.status).toBe('timeout');
    expect(r.verdict.inconclusiveReasons[0]).toMatch(/tempo limite/);
  });
});

describe('o engine não confunde falha de infraestrutura com evidência', () => {
  it('namespace que some no meio da execução não vira "registro ausente"', async () => {
    const cfg = config('held-update-after-delete', 'vulnerable');
    const namespace = newNamespace();
    const r = await executeScenario({
      scenario: getScenario(cfg.scenarioId)!,
      config: cfg,
      namespace,
      adapter: svc.adapter,
      beforeStep: async (step) => {
        if (step.id === 'inspect-after') await svc.adapter.resetNamespace(namespace, { timeoutMs: 2000 });
      },
    });
    expect(r.steps.find((s) => s.stepId === 'inspect-after')?.status).toBe('failed');
    expect(r.verdict.result).toBe('INCONCLUSIVE');
  });

  it('leitura em namespace inexistente é falha do adapter, não ausência', async () => {
    await expect(svc.adapter.inspectEntity(newNamespace(), 'item-17', { timeoutMs: 2000 })).rejects.toBeInstanceOf(AdapterError);
  });

  it('se gravar a observação falhar, a execução é interrompida sem culpar o alvo', async () => {
    const cfg = config('held-update-after-delete', 'guarded');
    const recorded: StepObservation[] = [];
    const attempt = executeScenario({
      scenario: getScenario(cfg.scenarioId)!,
      config: cfg,
      namespace: newNamespace(),
      adapter: svc.adapter,
      onStep: (obs) => {
        if (obs.seq === 2) throw new Error('banco do laboratório indisponível');
        recorded.push(obs);
      },
    });
    await expect(attempt).rejects.toThrow('banco do laboratório indisponível');
    expect(recorded.map((s) => [s.seq, s.status])).toEqual([[1, 'ok']]);
  });
});

describe('reprodutibilidade e isolamento', () => {
  const signature = (r: Awaited<ReturnType<typeof run>>) =>
    r.steps.map((s) => [s.stepId, s.status, s.exchange?.response?.status, s.facts.writeOutcome, s.facts.visible, s.facts.observedGeneration]);

  it('reexecutar a mesma configuração produz a mesma sequência e a mesma classificação', async () => {
    const cfg = config('held-update-after-delete', 'vulnerable');
    const a = await run(svc.adapter, cfg);
    const b = await run(svc.adapter, cfg);
    expect(signature(b)).toEqual(signature(a));
    expect(b.verdict.result).toBe(a.verdict.result);
    expect(b.entityId).toBe(a.entityId);
  });

  it('execuções simultâneas com o mesmo id de registro não interferem entre si', async () => {
    const [v1, g1, v2, g2] = await Promise.all([
      run(svc.adapter, config('held-update-after-delete', 'vulnerable')),
      run(svc.adapter, config('held-update-after-delete', 'guarded')),
      run(svc.adapter, config('replay-after-delete', 'vulnerable')),
      run(svc.adapter, config('replay-after-delete', 'guarded')),
    ]);
    expect(new Set([v1, g1, v2, g2].map((r) => r.entityId))).toEqual(new Set(['item-17']));
    expect([v1, g1, v2, g2].map((r) => r.verdict.result)).toEqual(['VIOLATION', 'NO_VIOLATION_OBSERVED', 'VIOLATION', 'NO_VIOLATION_OBSERVED']);
  });

  it('o reset apaga somente o namespace indicado', async () => {
    const keep = await run(svc.adapter, config('held-update-after-delete', 'vulnerable'));
    const drop = await run(svc.adapter, config('held-update-after-delete', 'vulnerable'));
    await svc.adapter.resetNamespace(drop.namespace, { timeoutMs: 2000 });
    const kept = await svc.adapter.inspectEntity(keep.namespace, 'item-17', { timeoutMs: 2000 });
    expect(kept.facts.visible).toBe(true);
    const gone = await fetch(`${svc.url}/namespaces/${drop.namespace}`);
    expect(gone.status).toBe(404);
  });

  it('recusa namespaces fora do prefixo de teste', async () => {
    const res = await fetch(`${svc.url}/namespaces/production`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    const created = await fetch(`${svc.url}/namespaces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ namespace: 'public', mode: 'guarded' }),
    });
    expect(created.status).toBe(400);
  });

});
