import type { Run, StepObservation } from '@residuo/contracts';
import { CircleDashed, Crosshair, Loader2, PauseCircle } from 'lucide-react';
import { FAULT_LABEL, POLICY_LABEL, VERDICT_META } from '../ui';

interface Props {
  run: Run;
  steps: StepObservation[];
  total: number;
  onJump: (seq: number) => void;
}

function missingEvidenceSeq(steps: StepObservation[]): number | undefined {
  return steps.find((s) => (s.status !== 'ok' && s.status !== 'skipped') || (s.kind === 'confirm-deletion' && s.facts.confirmed === false))?.seq;
}

export function VerdictBanner({ run, steps, total, onJump }: Props) {
  const v = run.verdict;
  const c = run.config;
  const chips = (
    <div className="config-chips">
      <span className="chip plain">modo {c.mode}</span>
      <span className="chip plain" title={POLICY_LABEL[c.policy]}>
        política {c.policy}
      </span>
      <span className="chip plain">semente {c.seed}</span>
      <span className="chip plain">
        {c.scenarioId} v{c.scenarioVersion}
      </span>
      <span className="chip plain">registro {run.entityId}</span>
      {c.fault !== 'none' && <span className="chip plain">falha: {FAULT_LABEL[c.fault]}</span>}
      {c.stepMode === 'manual' && <span className="chip plain">passo a passo</span>}
      {run.replayOf && <span className="chip plain">reexecução de {run.replayOf}</span>}
    </div>
  );

  if (!v) {
    const paused = run.status === 'paused';
    return (
      <section className="verdict tone tone-neutral" aria-live="polite">
        <div className="verdict-icon">
          {paused ? <PauseCircle size={26} aria-hidden="true" /> : <Loader2 size={26} className="spin" aria-hidden="true" />}
        </div>
        <div>
          <div className="verdict-title">
            <h2>{paused ? 'Aguardando você avançar' : run.status === 'queued' ? 'Na fila' : 'Executando contra o serviço de referência'}</h2>
            <span className="verdict-code">{run.status.toUpperCase()}</span>
          </div>
          <p>
            {steps.length} de {total} etapas registradas. O veredito só é calculado depois da última observação.
          </p>
          <div className="progress" aria-hidden="true">
            <span style={{ width: `${(steps.length / total) * 100}%` }} />
          </div>
          {chips}
        </div>
        <div />
      </section>
    );
  }

  const meta = VERDICT_META[v.result];
  const Icon = meta.icon;
  const violation = v.violations[0];
  const allowance = v.allowances[0];

  return (
    <section className={`verdict tone tone-${meta.tone}`} aria-live="polite" aria-label="Veredito da execução">
      <div className="verdict-icon">
        <Icon size={28} aria-hidden="true" />
      </div>
      <div>
        <div className="verdict-title">
          <h2>{meta.label}</h2>
          <span className="verdict-code">{v.result}</span>
          {run.status === 'interrupted' && <span className="chip tone tone-failure">execução interrompida</span>}
        </div>
        <p>{v.summary}</p>
        {v.result === 'INCONCLUSIVE' && v.inconclusiveReasons.length > 1 && (
          <ul>
            {v.inconclusiveReasons.slice(1).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {v.result === 'VIOLATION' && v.inconclusiveReasons.length > 0 && (
          <p className="small muted">Observações adicionais: {v.inconclusiveReasons.join(' ')}</p>
        )}
        {chips}
      </div>
      <div className="verdict-actions">
        {violation && (
          <button type="button" className="btn btn-primary" onClick={() => onJump(violation.observedAtSeq)}>
            <Crosshair size={15} aria-hidden="true" /> Ver o reaparecimento (etapa {violation.observedAtSeq})
          </button>
        )}
        {violation?.causedBySeq && (
          <button type="button" className="btn" onClick={() => onJump(violation.causedBySeq!)}>
            {violation.attribution === 'provenance' ? 'Ver a causa' : 'Ver a escrita associada'} (etapa {violation.causedBySeq})
          </button>
        )}
        {allowance && (
          <button type="button" className="btn" onClick={() => onJump(allowance.observedAtSeq)}>
            Ver a evidência (etapa {allowance.observedAtSeq})
          </button>
        )}
        {v.result === 'INCONCLUSIVE' && missingEvidenceSeq(steps) !== undefined && (
          <button type="button" className="btn" onClick={() => onJump(missingEvidenceSeq(steps)!)}>
            <Crosshair size={15} aria-hidden="true" /> Ver onde faltou evidência (etapa {missingEvidenceSeq(steps)})
          </button>
        )}
        {v.result === 'NO_VIOLATION_OBSERVED' && v.checkedPoints.length > 0 && (
          <button type="button" className="btn" onClick={() => onJump(v.checkedPoints.at(-1)!.seq)}>
            <CircleDashed size={15} aria-hidden="true" /> Ver a última leitura
          </button>
        )}
      </div>
    </section>
  );
}
