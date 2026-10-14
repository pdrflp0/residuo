/**
 * Avaliador de invariantes. Função pura: recebe as observações gravadas e devolve o veredito.
 * Não chama o alvo, não olha o relógio, não depende da interface — por isso é reexecutável
 * sobre um relatório exportado e testável com fixtures determinísticas.
 *
 * Invariante v1 ("deleted-generation-stays-gone"): depois que a exclusão de (id, geração G)
 * foi CONFIRMADA, nenhuma leitura coberta pelo teste pode ver (id, G) de novo, a não ser que a
 * política permita e exista evidência de restauração autorizada.
 */
import type {
  Allowance,
  CheckedPoint,
  Policy,
  StepObservation,
  Verdict,
  VerdictResult,
  Violation,
} from '@residuo/contracts';

export interface EvaluateInput {
  policy: Policy;
  steps: StepObservation[];
  /** o cenário declara uma exclusão? (todos os cenários v1 declaram) */
  expectsDeletion?: boolean;
}

const statusText: Record<string, string> = {
  failed: 'falhou',
  timeout: 'excedeu o tempo limite',
  unsupported: 'não é suportada pelo adapter',
};

export function evaluate({ policy, steps, expectsDeletion = true }: EvaluateInput): Verdict {
  const inconclusiveReasons: string[] = [];
  const violations: Violation[] = [];
  const allowances: Allowance[] = [];

  const deleteStep = steps.find((s) => s.kind === 'delete' && s.status === 'ok' && s.facts.wrote && s.facts.deletionId);
  const deletedGeneration = deleteStep?.facts.generation;
  const confirmStep = deleteStep
    ? steps.find(
        (s) =>
          s.kind === 'confirm-deletion' &&
          s.seq > deleteStep.seq &&
          s.status === 'ok' &&
          s.facts.confirmed === true &&
          s.facts.deletionId === deleteStep.facts.deletionId,
      )
    : undefined;

  // Ordem dos motivos: a falha que causou o problema primeiro, as consequências depois.
  for (const s of steps) {
    if (s.status === 'failed' || s.status === 'timeout' || s.status === 'unsupported') {
      if (s.kind === 'confirm-deletion') continue; // descrito no motivo de confirmação
      inconclusiveReasons.push(`Etapa ${s.seq} (${s.title}) ${statusText[s.status]}${s.error ? `: ${s.error}` : ''}.`);
    }
  }

  if (expectsDeletion) {
    if (!deleteStep) {
      const attempt = steps.find((s) => s.kind === 'delete');
      inconclusiveReasons.push(
        attempt?.status === 'ok'
          ? `O alvo recusou a exclusão (${attempt.facts.writeOutcome ?? '?'}); não há geração excluída para vigiar.`
          : 'A exclusão não chegou a ser executada; não há geração excluída para vigiar.',
      );
    } else if (!confirmStep) {
      const attempt = steps.find((s) => s.kind === 'confirm-deletion');
      let detail: string;
      if (!attempt) detail = 'nenhuma etapa de confirmação foi executada';
      else if (attempt.status === 'skipped') detail = `a etapa ${attempt.seq} não foi executada`;
      else if (attempt.status !== 'ok') detail = `a etapa ${attempt.seq} ${statusText[attempt.status]}${attempt.error ? ` (${attempt.error})` : ''}`;
      else detail = `o alvo respondeu "${attempt.facts.confirmationStatus ?? 'desconhecido'}" em vez de "effective"`;
      inconclusiveReasons.push(`A confirmação da exclusão não foi obtida: ${detail}.`);
    }
  }

  if (deleteStep && deletedGeneration === undefined) {
    inconclusiveReasons.push(`A exclusão da etapa ${deleteStep.seq} não informou qual geração foi excluída.`);
  }

  const skipped = steps.filter((s) => s.status === 'skipped');
  if (skipped.length > 0) {
    inconclusiveReasons.push(`Etapas não executadas: ${skipped.map((s) => s.seq).join(', ')}.`);
  }

  for (const s of steps) {
    if (s.kind === 'inspect' && s.status === 'ok' && s.facts.visible === undefined) {
      inconclusiveReasons.push(`A leitura da etapa ${s.seq} não informou se o registro estava visível.`);
    }
  }

  const checkedPoints: CheckedPoint[] = steps
    .filter((s) => s.kind === 'inspect' && s.status === 'ok' && s.facts.visible !== undefined)
    .map((s) => ({
      seq: s.seq,
      stepId: s.stepId,
      visible: s.facts.visible === true,
      ...(s.facts.observedGeneration !== undefined ? { observedGeneration: s.facts.observedGeneration } : {}),
      afterConfirmation: confirmStep !== undefined && s.seq > confirmStep.seq,
    }));

  if (confirmStep && deletedGeneration !== undefined && deleteStep) {
    const entityId = deleteStep.facts.entityId ?? '?';
    const after = checkedPoints.filter((p) => p.afterConfirmation);
    if (after.length === 0) inconclusiveReasons.push('Nenhuma leitura foi feita depois da confirmação da exclusão.');
    const lastWrite = steps.filter((s) => s.seq > confirmStep.seq && s.status === 'ok' && s.facts.wrote === true).at(-1);
    if (after.length > 0 && lastWrite && !after.some((p) => p.seq > lastWrite.seq)) {
      inconclusiveReasons.push(`Nenhuma leitura foi feita depois da última escrita (etapa ${lastWrite.seq}).`);
    }

    for (const point of after) {
      if (!point.visible) continue;
      const obs = steps.find((s) => s.seq === point.seq)!;
      const gen = point.observedGeneration;

      if (gen === undefined) {
        inconclusiveReasons.push(`A leitura da etapa ${point.seq} viu o registro, mas não informou a geração.`);
        continue;
      }

      if (gen === deletedGeneration) {
        const restore = [...steps]
          .reverse()
          .find(
            (s) =>
              s.kind === 'restore' &&
              s.seq < point.seq &&
              s.seq > confirmStep.seq &&
              s.status === 'ok' &&
              s.facts.wrote === true &&
              s.facts.generation === gen &&
              s.facts.deletionId === deleteStep.facts.deletionId &&
              !!s.facts.authorization?.actor,
          );
        if (restore && policy === 'explicit-restore') {
          if (!allowances.some((a) => a.kind === 'authorized-restore' && a.generation === gen)) {
            allowances.push({
              kind: 'authorized-restore',
              entityId,
              generation: gen,
              observedAtSeq: point.seq,
              authorizedBySeq: restore.seq,
              explanation: `A geração g${gen} voltou por restauração autorizada (etapa ${restore.seq}, ator "${restore.facts.authorization!.actor}"), e a política "explicit-restore" permite isso.`,
            });
          }
          continue;
        }

        const existing = violations.find((v) => v.generation === gen);
        if (existing) {
          existing.evidenceSeqs.push(point.seq);
          continue;
        }
        const cause = attributeCause(steps, point.seq, obs.facts.lastWrittenBy, confirmStep.seq, checkedPoints);
        const causeText = cause.step
          ? ` ${cause.attribution === 'provenance' ? 'O alvo informa que a última escrita veio de' : 'A única escrita entre as leituras foi'} "${cause.step.title}" (etapa ${cause.step.seq}, resultado ${cause.step.facts.writeOutcome ?? '?'}).`
          : ' Não há evidência suficiente para associar o reaparecimento a uma operação específica.';
        const policyText =
          restore && policy === 'delete-wins'
            ? ` Houve uma restauração autorizada (etapa ${restore.seq}), mas a política declarada "delete-wins" não permite restauração.`
            : '';
        violations.push({
          invariant: 'deleted-generation-stays-gone',
          entityId,
          generation: gen,
          observedAtSeq: point.seq,
          ...(cause.step ? { causedBySeq: cause.step.seq } : {}),
          attribution: cause.attribution,
          explanation: `A geração g${gen} de ${entityId}, excluída e confirmada na etapa ${confirmStep.seq}, voltou a ficar visível na etapa ${point.seq}.${causeText}${policyText}`,
          evidenceSeqs: [deleteStep.seq, confirmStep.seq, ...(cause.step ? [cause.step.seq] : []), point.seq],
        });
        continue;
      }

      if (gen > deletedGeneration) {
        const creator = steps.find(
          (s) =>
            s.kind === 'create' &&
            s.status === 'ok' &&
            s.facts.wrote === true &&
            s.facts.generation === gen &&
            s.seq > confirmStep.seq &&
            s.seq < point.seq,
        );
        if (creator) {
          if (!allowances.some((a) => a.kind === 'new-generation' && a.generation === gen)) {
            allowances.push({
              kind: 'new-generation',
              entityId,
              generation: gen,
              observedAtSeq: point.seq,
              authorizedBySeq: creator.seq,
              explanation: `O registro visível é a geração g${gen}, criada explicitamente na etapa ${creator.seq}. A geração excluída g${deletedGeneration} continua ausente.`,
            });
          }
        } else {
          inconclusiveReasons.push(`A geração g${gen} apareceu na etapa ${point.seq} sem uma criação explícita observada.`);
        }
        continue;
      }

      inconclusiveReasons.push(`A leitura da etapa ${point.seq} viu a geração g${gen}, anterior à excluída (g${deletedGeneration}).`);
    }
  }

  const confirmationMissing = expectsDeletion && !confirmStep;
  let result: VerdictResult;
  if (confirmationMissing) result = 'INCONCLUSIVE';
  else if (violations.length > 0) result = 'VIOLATION';
  else if (inconclusiveReasons.length > 0) result = 'INCONCLUSIVE';
  else if (allowances.length > 0) result = 'POLICY_ALLOWED';
  else result = 'NO_VIOLATION_OBSERVED';

  return {
    result,
    summary: summarize(result, violations, allowances, inconclusiveReasons, checkedPoints),
    violations,
    allowances,
    inconclusiveReasons,
    checkedPoints,
    ...(deletedGeneration !== undefined ? { deletedGeneration } : {}),
    ...(confirmStep ? { confirmationSeq: confirmStep.seq } : {}),
  };
}

function attributeCause(
  steps: StepObservation[],
  observedSeq: number,
  lastWrittenBy: string | undefined,
  confirmSeq: number,
  points: CheckedPoint[],
): { step?: StepObservation; attribution: Violation['attribution'] } {
  // Só escritas confirmadas pelo alvo e posteriores à confirmação podem explicar um reaparecimento.
  if (lastWrittenBy) {
    const best = [...steps]
      .reverse()
      .find((s) => s.seq < observedSeq && s.seq > confirmSeq && s.status === 'ok' && s.facts.wrote === true && s.facts.opRef === lastWrittenBy);
    if (best) return { step: best, attribution: 'provenance' };
  }
  const previousPoint = [...points].reverse().find((p) => p.seq < observedSeq);
  const from = Math.max(confirmSeq, previousPoint?.seq ?? 0);
  const writes = steps.filter((s) => s.seq > from && s.seq < observedSeq && s.status === 'ok' && s.facts.wrote === true);
  if (writes.length === 1) return { step: writes[0]!, attribution: 'ordering' };
  return { attribution: 'unknown' };
}

function summarize(
  result: VerdictResult,
  violations: Violation[],
  allowances: Allowance[],
  reasons: string[],
  points: CheckedPoint[],
): string {
  switch (result) {
    case 'VIOLATION':
      return violations[0]!.explanation;
    case 'POLICY_ALLOWED':
      return allowances.map((a) => a.explanation).join(' ');
    case 'INCONCLUSIVE':
      return `Resultado inconclusivo: ${reasons[0] ?? 'faltou evidência.'}`;
    case 'NO_VIOLATION_OBSERVED':
      return `Nenhuma violação observada nas ${points.filter((p) => p.afterConfirmation).length} leitura(s) feitas após a confirmação. Isso vale para esta sequência e estes pontos de observação; não prova correção em geral.`;
  }
}
