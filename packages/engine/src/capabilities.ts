import type { AdapterCapability, StepKind } from '@residuo/contracts';
import type { Scenario } from './scenarios';

/** Capacidade que cada tipo de etapa exige do adapter. */
export const STEP_CAPABILITY: Record<StepKind, AdapterCapability> = {
  create: 'create-entity',
  'prepare-update': 'prepare-update',
  hold: 'hold-release-delivery',
  release: 'hold-release-delivery',
  replay: 'redeliver',
  delete: 'delete-entity',
  'confirm-deletion': 'confirm-deletion',
  restore: 'restore-entity',
  inspect: 'inspect-entity',
};

export function requiredCapabilities(scenario: Scenario): AdapterCapability[] {
  return [...new Set(scenario.steps.map((s) => STEP_CAPABILITY[s.kind]))];
}

/** Capacidades que o cenário exige e o adapter não declara. */
export function missingCapabilities(scenario: Scenario, available: readonly AdapterCapability[]): AdapterCapability[] {
  return requiredCapabilities(scenario).filter((c) => !available.includes(c));
}
