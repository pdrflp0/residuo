/**
 * Exploração de ordens de entrega (nível 2).
 *
 * Em vez de uma ordem fixa, gera as ordens válidas para um pequeno conjunto de ações —
 * excluir (com confirmação), liberar a edição 1, liberar a edição 2, reentregar a edição 1 —
 * e executa cada uma contra o alvo. Quando uma ordem viola o invariante, reduz a sequência
 * removendo ações enquanto a violação continuar acontecendo (minimização gulosa, "1-mínima").
 *
 * Cada ordem é executada de forma determinística (barreiras). A semente só escolhe a ordem de
 * exploração quando há orçamento menor que o total. Isso não é exploração exaustiva de
 * concorrência real: são interleavings controlados de um conjunto pequeno de ações.
 */
import type { Lane, Policy, StepKind, StepObservation, TargetAdapter, TargetMode, Verdict } from '@residuo/contracts';
import { executeScenario } from './execute';
import type { Scenario, ScenarioStep } from './scenarios';
import { mulberry32 } from './seed';

export const EXPLORE_ACTIONS = ['delete', 'release-1', 'release-2', 'replay-1'] as const;
export type ExploreAction = (typeof EXPLORE_ACTIONS)[number];

export interface OrderRun {
  order: ExploreAction[];
  scenario: Scenario;
  namespace: string;
  steps: StepObservation[];
  verdict: Verdict;
}

export interface ExploreOptions {
  adapter: TargetAdapter;
  mode: TargetMode;
  policy?: Policy;
  seed: number;
  timeoutMs?: number;
  /** máximo de ordens a executar (padrão: todas) */
  budget?: number;
  /** ações disponíveis; padrão: todas as que o adapter suporta */
  actions?: ExploreAction[];
  namespacePrefix: string;
  onRun?: (run: OrderRun, index: number) => void | Promise<void>;
}

export interface ExploreResult {
  totalOrders: number;
  explored: OrderRun[];
  violations: OrderRun[];
  inconclusive: OrderRun[];
  /** menor sequência encontrada que ainda viola, partindo da primeira violação */
  minimal?: OrderRun;
}

const LABEL: Record<ExploreAction, string> = {
  delete: 'exclusão',
  'release-1': 'edição 1',
  'release-2': 'edição 2',
  'replay-1': 'reentrega 1',
};

export function isValidOrder(order: readonly ExploreAction[]): boolean {
  if (!order.includes('delete')) return false;
  if (new Set(order).size !== order.length) return false;
  const r1 = order.indexOf('release-1');
  const p1 = order.indexOf('replay-1');
  return p1 === -1 || (r1 !== -1 && r1 < p1);
}

export function allOrders(actions: readonly ExploreAction[]): ExploreAction[][] {
  const out: ExploreAction[][] = [];
  const permute = (rest: ExploreAction[], acc: ExploreAction[]) => {
    if (rest.length === 0) {
      if (isValidOrder(acc)) out.push(acc);
      return;
    }
    rest.forEach((a, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, a]));
  };
  permute([...actions], []);
  return out;
}

const step = (id: string, kind: StepKind, lane: Lane, title: string, params?: ScenarioStep['params']): ScenarioStep => ({
  id,
  kind,
  lane,
  title,
  plain: '',
  ...(params ? { params } : {}),
});

/** Monta um cenário a partir de uma ordem de ações. Depois da exclusão, toda ação é seguida de uma leitura. */
export function scenarioForOrder(order: readonly ExploreAction[]): Scenario {
  const updates = [...new Set(order.filter((a) => a !== 'delete').map((a) => Number(a.split('-')[1])))].sort();
  const steps: ScenarioStep[] = [step('create', 'create', 'api', 'Criar registro')];
  for (const n of updates) {
    steps.push(step(`prepare-${n}`, 'prepare-update', 'client', `Preparar edição ${n}`));
    steps.push(step(`hold-${n}`, 'hold', 'client', `Reter edição ${n}`, { delivery: `prepare-${n}` }));
  }
  let deleted = false;
  for (const a of order) {
    if (a === 'delete') {
      steps.push(step('delete', 'delete', 'api', 'Excluir registro'));
      steps.push(step('confirm', 'confirm-deletion', 'api', 'Confirmar exclusão', { deletion: 'delete' }));
      deleted = true;
    } else {
      const n = a.split('-')[1];
      const kind: StepKind = a.startsWith('replay') ? 'replay' : 'release';
      steps.push(step(a, kind, 'consumer', kind === 'replay' ? `Reentregar edição ${n}` : `Liberar edição ${n}`, { delivery: `prepare-${n}` }));
    }
    if (deleted) steps.push(step(`inspect-after-${a}`, 'inspect', 'observer', `Ler após ${LABEL[a]}`));
  }
  return {
    id: `explore:${order.join('>')}`,
    version: 'explore-1',
    title: `Ordem explorada: ${order.map((a) => LABEL[a]).join(' → ')}`,
    summary: 'Cenário gerado pela exploração de ordens de entrega.',
    defaultPolicy: 'delete-wins',
    story: [],
    steps,
  };
}

export async function exploreOrders(opts: ExploreOptions): Promise<ExploreResult> {
  const caps = opts.adapter.describe().capabilities;
  const supported = (opts.actions ?? [...EXPLORE_ACTIONS]).filter((a) => a !== 'replay-1' || caps.includes('redeliver'));
  const orders = allOrders(supported);

  // a semente decide a ordem de visita (relevante só quando o orçamento corta a lista)
  const rnd = mulberry32(opts.seed);
  const visit = orders.map((o) => ({ o, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.o);
  const budget = Math.min(opts.budget ?? visit.length, visit.length);

  let counter = 0;
  const runOrder = async (order: ExploreAction[]): Promise<OrderRun> => {
    const scenario = scenarioForOrder(order);
    const namespace = `${opts.namespacePrefix}-${++counter}`;
    const { steps, verdict } = await executeScenario({
      scenario,
      namespace,
      adapter: opts.adapter,
      config: {
        scenarioId: scenario.id,
        scenarioVersion: scenario.version,
        mode: opts.mode,
        policy: opts.policy ?? 'delete-wins',
        seed: opts.seed,
        fault: 'none',
        stepMode: 'auto',
        timeoutMs: opts.timeoutMs ?? 3000,
      },
    });
    return { order, scenario, namespace, steps, verdict };
  };

  const explored: OrderRun[] = [];
  for (let i = 0; i < budget; i++) {
    const run = await runOrder(visit[i]!);
    explored.push(run);
    await opts.onRun?.(run, i);
  }

  const violations = explored.filter((r) => r.verdict.result === 'VIOLATION');
  const inconclusive = explored.filter((r) => r.verdict.result === 'INCONCLUSIVE');
  // ponto de partida canônico (independe da ordem de visita): menor sequência, depois ordem alfabética
  const first = [...violations].sort((a, b) => a.order.length - b.order.length || a.order.join('>').localeCompare(b.order.join('>')))[0];
  const minimal = first ? await shrink(first, runOrder) : undefined;
  return { totalOrders: orders.length, explored, violations, inconclusive, ...(minimal ? { minimal } : {}) };
}

const REMOVAL_PREFERENCE: ExploreAction[] = ['replay-1', 'release-2', 'release-1'];

/** Remove ações uma a uma enquanto a violação persistir. A exclusão nunca sai (sem ela não há o que vigiar). */
async function shrink(start: OrderRun, runOrder: (o: ExploreAction[]) => Promise<OrderRun>): Promise<OrderRun> {
  let best = start;
  let progress = true;
  while (progress) {
    progress = false;
    // preferência fixa de remoção: o resultado não depende da semente
    for (const a of REMOVAL_PREFERENCE.filter((x) => best.order.includes(x))) {
      const candidate = best.order.filter((x) => x !== a);
      if (!isValidOrder(candidate)) continue;
      const run = await runOrder(candidate);
      if (run.verdict.result === 'VIOLATION') {
        best = run;
        progress = true;
        break;
      }
    }
  }
  return best;
}
