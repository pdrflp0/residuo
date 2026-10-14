/**
 * Vocabulário compartilhado entre engine, API, serviço de referência e interface.
 *
 * Termos centrais:
 * - id: identidade estável do registro ("item-17"). Sobrevive a exclusões.
 * - geração (generation): uma "vida" daquele id. Criar depois de excluir abre a geração seguinte.
 *   Por isso "item-17 g1 voltou" (ressurreição) é diferente de "item-17 g2 foi criado" (nova vida).
 * - revisão (revision): contador de versões dentro de uma geração. Uma atualização declara a
 *   revisão-base a partir da qual foi preparada.
 */
import { z } from 'zod';

/** Modos do serviço de referência. */
export const MODES = ['vulnerable', 'guarded'] as const;
export const Mode = z.enum(MODES);
export type Mode = z.infer<typeof Mode>;
/** `external`: alvo de terceiros via residuo.json; o comportamento é o do próprio sistema testado. */
export type TargetMode = Mode | 'external';

/**
 * Política declarada pela aplicação testada.
 * - delete-wins: exclusão confirmada é definitiva para aquela geração; uma nova geração explícita é permitida.
 * - explicit-restore: a geração excluída pode voltar somente por uma restauração autorizada e registrada.
 * "Abrir conflito para revisão humana" fica para o nível 2 (ver docs/roadmap.md).
 */
export const POLICIES = ['delete-wins', 'explicit-restore'] as const;
export const Policy = z.enum(POLICIES);
export type Policy = z.infer<typeof Policy>;

/** Falhas que o serviço de referência pode simular para provar que o engine não "aprova" o que não observou. */
export const FAULTS = ['none', 'confirm-unavailable', 'confirm-pending', 'inspect-hang'] as const;
export const Fault = z.enum(FAULTS);
export type Fault = z.infer<typeof Fault>;

export const STEP_MODES = ['auto', 'manual'] as const;
export const StepMode = z.enum(STEP_MODES);
export type StepMode = z.infer<typeof StepMode>;

export const LANES = ['api', 'client', 'consumer', 'observer'] as const;
export type Lane = (typeof LANES)[number];

export const STEP_KINDS = [
  'create',
  'prepare-update',
  'hold',
  'release',
  'replay',
  'delete',
  'confirm-deletion',
  'restore',
  'inspect',
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export const VERDICTS = ['VIOLATION', 'NO_VIOLATION_OBSERVED', 'INCONCLUSIVE', 'POLICY_ALLOWED'] as const;
export type VerdictResult = (typeof VERDICTS)[number];

/** ok = o alvo respondeu algo interpretável (inclusive 404/409 esperados). */
export type StepStatus = 'ok' | 'failed' | 'timeout' | 'unsupported' | 'skipped';

export interface HttpExchange {
  request: { method: string; path: string; body?: unknown };
  response?: { status: number; body: unknown };
  durationMs: number;
}

/**
 * Fatos extraídos pelo adapter a partir da resposta do alvo.
 * Campos de escrita registram o que o alvo DISSE ter feito; campos de leitura registram o que foi VISTO.
 * O avaliador só considera reaparecimento a partir de leituras (visible/observedGeneration).
 */
export interface StepFacts {
  entityId?: string;
  // escrita
  writeOutcome?: string;
  wrote?: boolean;
  generation?: number;
  revision?: number;
  baseRevision?: number;
  deliveryId?: string;
  deletionId?: string;
  restoreId?: string;
  authorization?: { actor: string; reason: string };
  opRef?: string;
  // confirmação da política
  confirmed?: boolean;
  confirmationStatus?: string;
  mechanism?: string;
  // leitura
  visible?: boolean;
  observedGeneration?: number;
  observedRevision?: number;
  lastWrittenBy?: string;
}

export interface StepObservation {
  seq: number;
  stepId: string;
  kind: StepKind;
  lane: Lane;
  title: string;
  status: StepStatus;
  startedAt: string;
  finishedAt: string;
  exchange?: HttpExchange;
  facts: StepFacts;
  error?: string;
}

export interface Violation {
  invariant: 'deleted-generation-stays-gone';
  entityId: string;
  generation: number;
  observedAtSeq: number;
  /** Etapa de escrita associada ao reaparecimento, quando há evidência. */
  causedBySeq?: number;
  attribution: 'provenance' | 'ordering' | 'unknown';
  explanation: string;
  evidenceSeqs: number[];
}

export interface Allowance {
  kind: 'new-generation' | 'authorized-restore';
  entityId: string;
  generation: number;
  observedAtSeq: number;
  authorizedBySeq: number;
  explanation: string;
}

export interface CheckedPoint {
  seq: number;
  stepId: string;
  visible: boolean;
  observedGeneration?: number;
  afterConfirmation: boolean;
}

export interface Verdict {
  result: VerdictResult;
  summary: string;
  violations: Violation[];
  allowances: Allowance[];
  inconclusiveReasons: string[];
  checkedPoints: CheckedPoint[];
  deletedGeneration?: number;
  confirmationSeq?: number;
}

export interface ScenarioStepSummary {
  id: string;
  kind: StepKind;
  lane: Lane;
  title: string;
  plain: string;
}

export interface ScenarioSummary {
  id: string;
  version: string;
  title: string;
  summary: string;
  defaultPolicy: Policy;
  story: string[];
  steps: ScenarioStepSummary[];
}

export const RunConfig = z.object({
  scenarioId: z.string().min(1).max(64),
  mode: Mode,
  policy: Policy.optional(),
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
  fault: Fault.default('none'),
  stepMode: StepMode.default('auto'),
  timeoutMs: z.number().int().min(200).max(30_000).default(3000),
});
export type RunConfigInput = z.input<typeof RunConfig>;

export interface ResolvedRunConfig {
  scenarioId: string;
  scenarioVersion: string;
  mode: TargetMode;
  policy: Policy;
  seed: number;
  fault: Fault;
  stepMode: StepMode;
  timeoutMs: number;
}

export type RunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'interrupted';

export interface AdapterDescriptor {
  name: string;
  version: string;
  capabilities: AdapterCapability[];
  observationPoints: string[];
  limits: string[];
}

export const ADAPTER_CAPABILITIES = [
  'create-entity',
  'prepare-update',
  'hold-release-delivery',
  'redeliver',
  'delete-entity',
  'confirm-deletion',
  'restore-entity',
  'inspect-entity',
  'write-provenance',
  'namespace-isolation',
] as const;
export type AdapterCapability = (typeof ADAPTER_CAPABILITIES)[number];

export interface Run {
  id: string;
  scenarioId: string;
  scenarioVersion: string;
  engineVersion: string;
  adapter: AdapterDescriptor;
  config: ResolvedRunConfig;
  namespace: string;
  entityId: string;
  status: RunStatus;
  replayOf?: string;
  nextStepId?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  verdict?: Verdict;
}

export interface RunDetail {
  run: Run;
  scenario: ScenarioSummary;
  steps: StepObservation[];
}

export interface StepDiff {
  stepId: string;
  title: string;
  base?: { seq: number; status: StepStatus; writeOutcome?: string; visible?: boolean; observedGeneration?: number };
  candidate?: { seq: number; status: StepStatus; writeOutcome?: string; visible?: boolean; observedGeneration?: number };
  changed: boolean;
}

export interface RunComparison {
  comparable: boolean;
  reasons: string[];
  base: { id: string; mode: TargetMode; result?: VerdictResult };
  candidate: { id: string; mode: TargetMode; result?: VerdictResult };
  resultChanged: boolean;
  steps: StepDiff[];
}

export interface ReportV1 {
  schema: 'residuo.report/v1';
  generatedAt: string;
  disclaimer: string;
  run: Run;
  scenario: ScenarioSummary;
  steps: StepObservation[];
  verdict?: Verdict;
  limits: string[];
  reproduce: { api: { method: 'POST'; path: '/api/runs'; body: Record<string, unknown> }; cli: string };
}
