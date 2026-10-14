import type { ScenarioSummary, StepObservation, Verdict } from '@residuo/contracts';
import { describeStep } from '@residuo/engine/narrative';
import { Eye, FileText, Ghost, Link2 } from 'lucide-react';
import { json, LANES, ToneIcon, TONE_LABEL } from '../ui';

interface Props {
  step?: StepObservation;
  scenario: ScenarioSummary;
  verdict?: Verdict;
  onJump?: (seq: number) => void;
  heading?: string;
  compact?: boolean;
}

const WRITE_KINDS = new Set(['create', 'release', 'replay', 'delete', 'restore']);

export function Evidence({ step, scenario, verdict, onJump, heading, compact }: Props) {
  if (!step) {
    return (
      <section className="panel evidence" aria-live="polite">
        <div className="empty">Selecione uma etapa na linha do tempo para ver requisição, resposta e fatos registrados.</div>
      </section>
    );
  }
  const def = scenario.steps.find((d) => d.id === step.stepId);
  const n = describeStep(step, verdict);
  const lane = LANES.find((l) => l.id === step.lane)!;
  const violation = verdict?.violations.find((v) => v.observedAtSeq === step.seq);
  const causeOf = verdict?.violations.find((v) => v.causedBySeq === step.seq);
  const allowance = verdict?.allowances.find((a) => a.observedAtSeq === step.seq || a.authorizedBySeq === step.seq);
  const factEntries = Object.entries(step.facts).filter(([, v]) => v !== undefined);
  const res = step.exchange?.response;

  return (
    <section className="panel evidence" aria-live="polite" aria-label={heading ?? `Evidência da etapa ${step.seq}`}>
      <header className="evidence-head">
        <div>
          <div className="eyebrow">
            {heading ? `${heading} · ` : ''}etapa {step.seq} · {lane.name}
          </div>
          <h2>{step.title}</h2>
          {def?.plain && <div className="muted small">{def.plain}</div>}
        </div>
        <span className={`chip tone tone-${n.tone}`}>
          <ToneIcon tone={n.tone} size={13} /> {TONE_LABEL[n.tone]}
        </span>
      </header>

      <div className="evidence-body">
        <div className={`callout tone tone-${n.tone}`}>
          <ToneIcon tone={n.tone} />
          <span>{n.headline}</span>
        </div>

        {violation && (
          <div className="callout tone tone-reappeared" role="note">
            <Ghost size={16} aria-hidden="true" />
            <span>
              <strong>Violação de “a geração excluída não volta”.</strong> {violation.explanation}
              {violation.causedBySeq && onJump && (
                <>
                  {' '}
                  <button type="button" className="btn btn-sm" onClick={() => onJump(violation.causedBySeq!)}>
                    <Link2 size={13} aria-hidden="true" />{' '}
                    {violation.attribution === 'provenance' ? 'ir para a causa' : 'ir para a escrita associada por ordem'} (etapa {violation.causedBySeq})
                  </button>
                </>
              )}
            </span>
          </div>
        )}
        {causeOf && !violation && (
          <div className="callout tone tone-reappeared" role="note">
            <Link2 size={16} aria-hidden="true" />
            <span>
              Esta escrita foi associada ao reaparecimento visto na etapa {causeOf.observedAtSeq} (atribuição: <code>{causeOf.attribution}</code>).
              {onJump && (
                <>
                  {' '}
                  <button type="button" className="btn btn-sm" onClick={() => onJump(causeOf.observedAtSeq)}>
                    ver a leitura
                  </button>
                </>
              )}
            </span>
          </div>
        )}
        {allowance && (
          <div className="callout tone tone-new" role="note">
            <ToneIcon tone="new" />
            <span>{allowance.explanation}</span>
          </div>
        )}

        <div className="source-note">
          {step.kind === 'inspect' ? (
            <>
              <Eye size={14} aria-hidden="true" /> Leitura independente feita pelo Resíduo: esta é a evidência usada no veredito.
            </>
          ) : WRITE_KINDS.has(step.kind) ? (
            <>
              <FileText size={14} aria-hidden="true" /> Escrita: registra o que o alvo <em>disse</em> ter feito. O veredito só considera leituras.
            </>
          ) : (
            <>
              <FileText size={14} aria-hidden="true" /> Etapa de controle registrada pelo engine.
            </>
          )}
        </div>

        {factEntries.length > 0 && (
          <div>
            <h3 className="eyebrow" style={{ marginBottom: 8 }}>
              Fatos extraídos pelo adapter
            </h3>
            <dl className="facts">
              {factEntries.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {step.error && (
          <div className="callout tone tone-failure">
            <ToneIcon tone="failure" />
            <span>{step.error}</span>
          </div>
        )}

        {step.exchange && (
          <div className="exchange" style={compact ? { gridTemplateColumns: '1fr' } : undefined}>
            <div className="code-block">
              <div className="code-head">
                <span>
                  {step.exchange.request.method} {step.exchange.request.path}
                </span>
                <span>requisição</span>
              </div>
              <pre>{step.exchange.request.body !== undefined ? json(step.exchange.request.body) : '(sem corpo)'}</pre>
            </div>
            <div className="code-block">
              <div className="code-head">
                <span className={`status-pill status-${String(res?.status ?? 0)[0]}`}>{res ? `HTTP ${res.status}` : 'sem resposta'}</span>
                <span>{step.exchange.durationMs} ms</span>
              </div>
              <pre>{res ? json(res.body) : '—'}</pre>
            </div>
          </div>
        )}

        <div className="muted small mono">
          início {step.startedAt} · fim {step.finishedAt} · status {step.status}
        </div>
      </div>
    </section>
  );
}
