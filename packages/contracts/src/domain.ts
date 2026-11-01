import { z } from 'zod';
import type { AiSummary } from './ai-summary';

export const MODES = ['vulnerable', 'guarded'] as const;
export const Mode = z.enum(MODES);
export type Mode = z.infer<typeof Mode>;
export type TargetMode = Mode | 'external';

export const POLICIES = ['delete-wins', 'explicit-restore'] as const;
export const Policy = z.enum(POLICIES);
export type Policy = z.infer<typeof Policy>;

export const FAULTS = ['none', 'confirm-unavailable', 'confirm-pending', 'inspect-hang'] as const;
export const Fault = z.enum(FAULTS);
export type Fault = z.infer<typeof Fault>;

export const STEP_MODES = ['auto', 'manual'] as const;
export const StepMode = z.enum(STEP_MODES);
export type StepMode = z.infer<typeof StepMode>;

export const LANES = ['api', 'client', 'consumer', 'ops', 'observer'] as const;
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
  'snapshot',
  'restore-snapshot',
  'inspect',
] as const;

export const OBSERVATION_POINTS = ['primary', 'cache', 'search'] as const;
export type ObservationPoint = string;
export type StepKind = (typeof STEP_KINDS)[number];

export const VERDICTS = ['VIOLATION', 'NO_VIOLATION_OBSERVED', 'INCONCLUSIVE', 'POLICY_ALLOWED'] as const;
export type VerdictResult = (typeof VERDICTS)[number];

export type StepStatus = 'ok' | 'failed' | 'timeout' | 'unsupported' | 'skipped';

export interface HttpExchange {
  request: { method: string; path: string; body?: unknown };
  response?: { status: number; body: unknown };
  durationMs: number;
}

export interface StepFacts {
  entityId?: string;
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
  confirmed?: boolean;
  confirmationStatus?: string;
  mechanism?: string;
  visible?: boolean;
  observedGeneration?: number;
  observedRevision?: number;
  lastWrittenBy?: string;
  observationPoint?: string;
  snapshotId?: string;
  reappliedDeletions?: number;
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
  causedBySeq?: number;
  attribution: 'provenance' | 'ordering' | 'stale-derived' | 'unknown';
  observationPoint?: string;
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
  observationPoint?: string;
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
  points: string[];
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
  'snapshot-restore',
  'inspect-derived',
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
  aiSummary?: AiSummary;
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
  aiSummary?: AiSummary;
}
