import type { RunComparison, RunDetail, StepDiff, StepObservation } from '@residuo/contracts';

/**
 * Compara duas execuções do mesmo cenário. Só são "comparáveis" se cenário, versão, semente,
 * política e falha injetada forem iguais — assim a diferença observada vem do modo do alvo.
 */
export function compareRuns(base: RunDetail, candidate: RunDetail): RunComparison {
  const a = base.run.config;
  const b = candidate.run.config;
  const reasons: string[] = [];
  if (a.scenarioId !== b.scenarioId) reasons.push('cenários diferentes');
  if (a.scenarioVersion !== b.scenarioVersion) reasons.push('versões de cenário diferentes');
  if (a.seed !== b.seed) reasons.push('sementes diferentes');
  if (a.policy !== b.policy) reasons.push('políticas diferentes');
  if (a.fault !== b.fault) reasons.push('falhas injetadas diferentes');
  const bothDone = base.run.status === 'completed' && candidate.run.status === 'completed';
  if (base.run.status !== 'completed' || candidate.run.status !== 'completed') {
    const pending = [base.run, candidate.run].filter((r) => r.status !== 'completed');
    reasons.push(...pending.map((r) => `${r.id} ${r.status === 'interrupted' ? 'foi interrompida' : 'ainda não terminou'}`));
  }

  const ids = [...new Set([...base.steps.map((s) => s.stepId), ...candidate.steps.map((s) => s.stepId)])];
  const steps: StepDiff[] = ids.map((stepId) => {
    const x = base.steps.find((s) => s.stepId === stepId);
    const y = candidate.steps.find((s) => s.stepId === stepId);
    const bx = x && brief(x);
    const by = y && brief(y);
    return {
      stepId,
      title: (x ?? y)!.title,
      ...(bx ? { base: bx } : {}),
      ...(by ? { candidate: by } : {}),
      // Só há diferença quando as duas execuções terminaram; etapa ainda não gravada não é "diferente".
      changed: bothDone && JSON.stringify(withoutSeq(bx)) !== JSON.stringify(withoutSeq(by)),
    };
  });

  const ra = base.run.verdict?.result;
  const rb = candidate.run.verdict?.result;
  return {
    comparable: reasons.length === 0,
    reasons,
    base: { id: base.run.id, mode: a.mode, ...(ra ? { result: ra } : {}) },
    candidate: { id: candidate.run.id, mode: b.mode, ...(rb ? { result: rb } : {}) },
    resultChanged: bothDone && ra !== undefined && rb !== undefined && ra !== rb,
    steps,
  };
}

function withoutSeq(b: ReturnType<typeof brief> | undefined) {
  if (!b) return null;
  const { seq: _seq, ...rest } = b;
  return rest;
}

function brief(s: StepObservation) {
  return {
    seq: s.seq,
    status: s.status,
    ...(s.facts.writeOutcome !== undefined ? { writeOutcome: s.facts.writeOutcome } : {}),
    ...(s.facts.visible !== undefined ? { visible: s.facts.visible } : {}),
    ...(s.facts.observedGeneration !== undefined ? { observedGeneration: s.facts.observedGeneration } : {}),
  };
}
