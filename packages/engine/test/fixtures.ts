/**
 * Construtor de observações para testar o avaliador sem rede.
 * Os fatos imitam o que o adapter extrai de respostas reais do serviço de referência.
 */
import type { Lane, RunDetail, StepFacts, StepKind, StepObservation, StepStatus } from '@residuo/contracts';
import { evaluate } from '../src/evaluate';
import { getScenario, summarizeScenario } from '../src/scenarios';

const LANE: Record<StepKind, Lane> = {
  create: 'api',
  'prepare-update': 'client',
  hold: 'client',
  release: 'consumer',
  replay: 'consumer',
  delete: 'api',
  'confirm-deletion': 'api',
  restore: 'api',
  snapshot: 'ops',
  'restore-snapshot': 'ops',
  inspect: 'observer',
};

export class Trace {
  readonly steps: StepObservation[] = [];

  add(kind: StepKind, facts: StepFacts, status: StepStatus = 'ok', stepId?: string): this {
    const seq = this.steps.length + 1;
    this.steps.push({
      seq,
      stepId: stepId ?? `${kind}-${seq}`,
      kind,
      lane: LANE[kind],
      title: kind,
      status,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:00.000Z',
      facts,
      ...(status !== 'ok' ? { error: `simulado: ${status}` } : {}),
    });
    return this;
  }

  create(generation = 1) {
    return this.add('create', { entityId: 'item-17', writeOutcome: 'CREATED', wrote: true, generation, revision: 1, opRef: `create:op_${generation}` });
  }
  deleteG(generation = 1) {
    return this.add('delete', { entityId: 'item-17', writeOutcome: 'DELETED', wrote: true, generation, revision: 1, deletionId: 'del_1' });
  }
  confirm(status: 'effective' | 'pending' = 'effective') {
    return this.add('confirm-deletion', { entityId: 'item-17', deletionId: 'del_1', confirmed: status === 'effective', confirmationStatus: status });
  }
  release(outcome: string, wrote: boolean, deliveryId = 'dlv_1') {
    return this.add('release', { entityId: 'item-17', writeOutcome: outcome, wrote, generation: 1, opRef: `delivery:${deliveryId}`, deliveryId });
  }
  absent() {
    return this.add('inspect', { entityId: 'item-17', visible: false });
  }
  visible(generation: number, lastWrittenBy?: string, point?: string) {
    return this.add('inspect', {
      entityId: 'item-17',
      visible: true,
      observedGeneration: generation,
      observedRevision: 2,
      ...(lastWrittenBy ? { lastWrittenBy } : {}),
      ...(point ? { observationPoint: point } : {}),
    });
  }
  absentAt(point: string) {
    return this.add('inspect', { entityId: 'item-17', visible: false, observationPoint: point });
  }
}

/** Detalhe de execução do cenário principal, com o veredito calculado pelo avaliador. */
export function detail(mode: 'vulnerable' | 'guarded', trace: Trace, id = `run_${mode}`): RunDetail {
  const scenario = getScenario('held-update-after-delete')!;
  const verdict = evaluate({ policy: 'delete-wins', steps: trace.steps });
  return {
    scenario: summarizeScenario(scenario),
    steps: trace.steps,
    run: {
      id,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      engineVersion: '0.1.0',
      adapter: { name: 'fixture', version: '0', capabilities: [], points: ['primary'], observationPoints: [], limits: ['limite do adapter'] },
      config: { scenarioId: scenario.id, scenarioVersion: scenario.version, mode, policy: 'delete-wins', seed: 1200, fault: 'none', stepMode: 'auto', timeoutMs: 3000 },
      namespace: `rsd-${id}`,
      entityId: 'item-17',
      status: 'completed',
      createdAt: '2026-01-01T00:00:00.000Z',
      verdict,
    },
  };
}
