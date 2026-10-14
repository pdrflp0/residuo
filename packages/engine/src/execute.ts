/**
 * Orquestrador. Executa as etapas do cenário uma por vez, na ordem declarada.
 *
 * Por que a ordem é reproduzível: cada chamada ao adapter só retorna depois que o alvo
 * terminou a operação (a liberação de uma entrega devolve o resultado do consumidor, a
 * confirmação devolve o estado da exclusão). A próxima etapa só começa depois disso.
 * Não há sleep decidindo ordem. A barreira opcional `beforeStep` permite pausar entre
 * etapas (modo manual) sem mudar a sequência.
 */
import {
  AdapterError,
  type AdapterResult,
  type CallOptions,
  type ResolvedRunConfig,
  type StepObservation,
  type StepStatus,
  type TargetAdapter,
  type Verdict,
} from '@residuo/contracts';
import { evaluate } from './evaluate';
import type { Scenario, ScenarioStep } from './scenarios';
import { syntheticData } from './seed';

export interface ExecuteOptions {
  scenario: Scenario;
  config: ResolvedRunConfig;
  namespace: string;
  adapter: TargetAdapter;
  /** barreira antes de cada etapa (modo manual); rejeitar aborta a execução */
  beforeStep?: (step: ScenarioStep, seq: number) => Promise<void>;
  onStep?: (obs: StepObservation) => void | Promise<void>;
  now?: () => Date;
}

export interface ExecutionResult {
  entityId: string;
  steps: StepObservation[];
  verdict: Verdict;
}

export const RESTORE_AUTHORIZATION = { actor: 'operador-demo', reason: 'restauração autorizada no cenário sintético' };

export async function executeScenario(opts: ExecuteOptions): Promise<ExecutionResult> {
  const { scenario, config, namespace, adapter } = opts;
  const now = opts.now ?? (() => new Date());
  const data = syntheticData(config.seed);
  const call: CallOptions = { timeoutMs: config.timeoutMs };
  const steps: StepObservation[] = [];

  const ctx = {
    generation: undefined as number | undefined,
    revision: undefined as number | undefined,
    creates: 0,
    deliveries: new Map<string, string>(),
    deletions: new Map<string, string>(),
  };

  let abortReason: string | undefined;
  try {
    await withTimeout(adapter.openNamespace({ namespace, mode: config.mode, fault: config.fault }, call), call.timeoutMs);
  } catch (err) {
    abortReason = `não foi possível abrir o namespace de teste: ${errorMessage(err)}`;
  }

  for (const [index, step] of scenario.steps.entries()) {
    const seq = index + 1;
    if (!abortReason && opts.beforeStep) {
      try {
        await opts.beforeStep(step, seq);
      } catch (err) {
        abortReason = errorMessage(err);
      }
    }

    const startedAt = now().toISOString();
    if (abortReason) {
      await record({ seq, step, status: 'skipped', startedAt, error: abortReason });
      continue;
    }

    // A chamada ao alvo e a gravação da observação ficam separadas: se a gravação falhar,
    // o erro sobe (execução interrompida) em vez de ser registrado como falha do alvo.
    let outcome: { status: StepStatus; result?: AdapterResult; error?: string };
    try {
      outcome = { status: 'ok', result: await withTimeout(runStep(step), call.timeoutMs) };
    } catch (err) {
      const status: StepStatus = err instanceof AdapterError ? err.kind : 'failed';
      outcome = {
        status,
        error: errorMessage(err),
        ...(err instanceof AdapterError && err.exchange ? { result: { exchange: err.exchange, facts: {} } } : {}),
      };
      abortReason = `etapa ${seq} não concluída (${status})`;
    }
    await record({ seq, step, startedAt, ...outcome });
  }

  const verdict = evaluate({ policy: config.policy, steps, expectsDeletion: scenario.steps.some((s) => s.kind === 'delete') });
  return { entityId: data.entityId, steps, verdict };

  async function record(r: {
    seq: number;
    step: ScenarioStep;
    status: StepStatus;
    startedAt: string;
    result?: AdapterResult;
    error?: string;
  }) {
    const obs: StepObservation = {
      seq: r.seq,
      stepId: r.step.id,
      kind: r.step.kind,
      lane: r.step.lane,
      title: r.step.title,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: now().toISOString(),
      facts: r.result?.facts ?? {},
      ...(r.result?.exchange ? { exchange: r.result.exchange } : {}),
      ...(r.error ? { error: r.error } : {}),
    };
    steps.push(obs);
    await opts.onStep?.(obs);
  }

  async function runStep(step: ScenarioStep): Promise<AdapterResult> {
    const id = data.entityId;
    switch (step.kind) {
      case 'create': {
        ctx.creates += 1;
        const payload = ctx.creates === 1 ? data.initial : { ...data.initial, note: 'criado de novo, explicitamente' };
        const r = await adapter.createEntity(namespace, { id, data: payload }, call);
        if (r.facts.wrote) {
          ctx.generation = r.facts.generation;
          ctx.revision = r.facts.revision;
        }
        return r;
      }
      case 'prepare-update': {
        if (ctx.generation === undefined || ctx.revision === undefined) throw new Error('não há revisão conhecida para servir de base');
        const r = await adapter.prepareUpdate(namespace, { id, generation: ctx.generation, baseRevision: ctx.revision, data: data.edit }, call);
        if (r.facts.deliveryId) ctx.deliveries.set(step.id, r.facts.deliveryId);
        return r;
      }
      case 'hold':
        return adapter.holdDelivery(namespace, requireRef(ctx.deliveries, step.params?.delivery, 'entrega'), call);
      case 'release':
      case 'replay': {
        const deliveryId = requireRef(ctx.deliveries, step.params?.delivery, 'entrega');
        const r = step.kind === 'release' ? await adapter.releaseDelivery(namespace, deliveryId, call) : await adapter.redeliver(namespace, deliveryId, call);
        if (r.facts.wrote && r.facts.revision !== undefined) ctx.revision = r.facts.revision;
        return r;
      }
      case 'delete': {
        if (ctx.generation === undefined) throw new Error('não há geração conhecida para excluir');
        const r = await adapter.deleteEntity(namespace, { id, generation: ctx.generation }, call);
        if (r.facts.deletionId) ctx.deletions.set(step.id, r.facts.deletionId);
        return r;
      }
      case 'confirm-deletion':
        return adapter.confirmDeletion(namespace, requireRef(ctx.deletions, step.params?.deletion, 'exclusão'), call);
      case 'restore':
        return adapter.restoreEntity(
          namespace,
          { id, deletionId: requireRef(ctx.deletions, step.params?.deletion, 'exclusão'), authorization: RESTORE_AUTHORIZATION },
          call,
        );
      case 'inspect':
        return adapter.inspectEntity(namespace, id, call);
    }
  }
}

function requireRef(map: Map<string, string>, stepId: string | undefined, what: string): string {
  const value = stepId ? map.get(stepId) : undefined;
  if (!value) throw new Error(`referência de ${what} ausente (etapa "${stepId ?? '?'}" não produziu identificador)`);
  return value;
}

/** Rede de segurança: mesmo que um adapter ignore o timeout, o engine não fica preso. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AdapterError('timeout', `sem resposta em ${ms + 500} ms`)), ms + 500);
  });
  try {
    return await Promise.race([promise, guard]);
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
