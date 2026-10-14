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
  snapshot: 'snapshot-restore',
  'restore-snapshot': 'snapshot-restore',
  inspect: 'inspect-entity',
};

export function requiredCapabilities(scenario: Scenario): AdapterCapability[] {
  return [...new Set(scenario.steps.map((s) => STEP_CAPABILITY[s.kind]))];
}

/** Capacidades que o cenário exige e o adapter não declara. */
export function missingCapabilities(scenario: Scenario, available: readonly AdapterCapability[]): AdapterCapability[] {
  return requiredCapabilities(scenario).filter((c) => !available.includes(c));
}

/** Pontos de leitura (além de "primary") que o cenário vigia. */
export function requiredPoints(scenario: Scenario): string[] {
  return [...new Set(scenario.steps.filter((s) => s.kind === 'inspect' && s.params?.point && s.params.point !== 'primary').map((s) => s.params!.point!))];
}

/** Tudo o que falta para rodar o cenário: capacidades e pontos de leitura, em texto legível. */
export function missingRequirements(scenario: Scenario, descriptor: { capabilities: readonly AdapterCapability[]; points: readonly string[] }): string[] {
  return [
    ...missingCapabilities(scenario, descriptor.capabilities),
    ...requiredPoints(scenario)
      .filter((p) => !descriptor.points.includes(p))
      .map((p) => `ponto de leitura "${p}"`),
  ];
}
