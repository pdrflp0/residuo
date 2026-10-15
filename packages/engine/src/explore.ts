/**
 * Exploração de ordens de entrega (nível 2; vários clientes no nível 3).
 *
 * Em vez de uma ordem fixa, gera as ordens válidas para um pequeno conjunto de ações —
 * excluir (com confirmação), liberar a edição de cada cliente offline (todas feitas sobre a
 * mesma revisão), reentregar a edição 1 — e executa cada uma contra o alvo. Quando uma ordem viola o invariante, reduz a sequência
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

export type ExploreAction = 'delete' | `release-${number}` | `replay-${number}`;

/** Acima disso o número de ordens explode: (clientes + 2)! / 2 — com 4 clientes, 360. */
export const MAX_CLIENTS = 4;

/** Ações para `clients` clientes offline: exclusão, uma entrega por cliente e, se houver, a reentrega da edição 1. */
export function exploreActions(clients = 2, opts: { replay?: boolean } = {}): ExploreAction[] {
  if (!Number.isInteger(clients) || clients < 1 || clients > MAX_CLIENTS) {
    throw new RangeError(`clientes deve ser um inteiro entre 1 e ${MAX_CLIENTS}`);
  }
  const actions: ExploreAction[] = ['delete'];
  for (let k = 1; k <= clients; k++) actions.push(`release-${k}`);
  if (opts.replay ?? true) actions.push('replay-1');
  return actions;
}

/** Conjunto padrão (2 clientes + reentrega): 12 ordens. */
export const EXPLORE_ACTIONS: readonly ExploreAction[] = exploreActions(2);

const clientOf = (a: ExploreAction) => Number(a.split('-')[1]);

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
  /** clientes offline com uma edição pendente cada (1 a MAX_CLIENTS; padrão 2) */
  clients?: number;
  /** ações disponíveis; padrão: as de `clients`, menos a reentrega se o adapter não a suporta */
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

const label = (a: ExploreAction) => (a === 'delete' ? 'exclusão' : a.startsWith('replay') ? `reentrega ${clientOf(a)}` : `edição ${clientOf(a)}`);

/** Válida: tem exclusão, não repete ação e cada reentrega vem depois da primeira entrega da mesma edição. */
export function isValidOrder(order: readonly ExploreAction[]): boolean {
  if (!order.includes('delete')) return false;
  if (new Set(order).size !== order.length) return false;
  return order.every((a, i) => !a.startsWith('replay') || order.slice(0, i).includes(`release-${clientOf(a)}`));
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
  const updates = [...new Set(order.filter((a) => a !== 'delete').map(clientOf))].sort((a, b) => a - b);
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
      const n = clientOf(a);
      const kind: StepKind = a.startsWith('replay') ? 'replay' : 'release';
      steps.push(step(a, kind, 'consumer', kind === 'replay' ? `Reentregar edição ${n}` : `Liberar edição ${n}`, { delivery: `prepare-${n}` }));
    }
    if (deleted) steps.push(step(`inspect-after-${a}`, 'inspect', 'observer', `Ler após ${label(a)}`));
  }
  return {
    id: `explore:${order.join('>')}`,
    version: 'explore-1',
    title: `Ordem explorada: ${order.map(label).join(' → ')}`,
    summary: 'Cenário gerado pela exploração de ordens de entrega.',
    defaultPolicy: 'delete-wins',
    story: [],
    steps,
  };
}

export async function exploreOrders(opts: ExploreOptions): Promise<ExploreResult> {
  const caps = opts.adapter.describe().capabilities;
  const supported = (opts.actions ?? exploreActions(opts.clients ?? 2)).filter((a) => !a.startsWith('replay') || caps.includes('redeliver'));
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

/** Preferência fixa de remoção: reentregas, depois entregas do último cliente para o primeiro. */
function removalPreference(order: readonly ExploreAction[]): ExploreAction[] {
  const rank = (a: ExploreAction) => (a.startsWith('replay') ? 1000 : 0) + clientOf(a);
  return order.filter((a) => a !== 'delete').sort((a, b) => rank(b) - rank(a));
}

/** Remove ações uma a uma enquanto a violação persistir. A exclusão nunca sai (sem ela não há o que vigiar). */
async function shrink(start: OrderRun, runOrder: (o: ExploreAction[]) => Promise<OrderRun>): Promise<OrderRun> {
  let best = start;
  let progress = true;
  while (progress) {
    progress = false;
    // preferência fixa de remoção: o resultado não depende da semente
    for (const a of removalPreference(best.order)) {
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
