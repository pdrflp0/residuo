import type { ScenarioSummary, StepObservation, Verdict } from '@residuo/contracts';
import { describeStep } from '@residuo/engine/narrative';
import { type KeyboardEvent, useRef } from 'react';
import { LANES, stepCode, ToneIcon } from '../ui';

interface Props {
  scenario: ScenarioSummary;
  steps: StepObservation[];
  verdict?: Verdict;
  revealed: number;
  selectedSeq?: number;
  onSelect: (seq: number) => void;
  nextStepId?: string;
  diffStepIds?: Set<string>;
  label: string;
}

/**
 * Faixas (API, cliente, consumidor, observador) × etapas em ordem lógica.
 * Cada nó é uma observação gravada; colunas ainda não reveladas aparecem tracejadas.
 */
export function Timeline({ scenario, steps, verdict, revealed, selectedSeq, onSelect, nextStepId, diffStepIds, label }: Props) {
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const cols = scenario.steps.length;
  const confirmSeq = verdict?.confirmationSeq ?? steps.find((s) => s.kind === 'confirm-deletion' && s.facts.confirmed)?.seq;
  const showWatched = confirmSeq !== undefined && revealed >= confirmSeq && confirmSeq < cols;
  const visibleSeqs = steps.filter((s) => s.seq <= revealed).map((s) => s.seq);
  const focusSeq = selectedSeq && visibleSeqs.includes(selectedSeq) ? selectedSeq : visibleSeqs.at(-1);

  const move = (e: KeyboardEvent, seq: number) => {
    const i = visibleSeqs.indexOf(seq);
    let target: number | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = visibleSeqs[i + 1];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = visibleSeqs[i - 1];
    else if (e.key === 'Home') target = visibleSeqs[0];
    else if (e.key === 'End') target = visibleSeqs.at(-1);
    else return;
    e.preventDefault();
    if (target !== undefined) {
      onSelect(target);
      refs.current.get(target)?.focus();
    }
  };

  return (
    <div className="timeline-scroll">
      <div className="timeline" role="group" aria-label={label} style={{ ['--cols' as string]: cols }}>
        {scenario.steps.map((def, i) => {
          const seq = i + 1;
          const watched = confirmSeq !== undefined && seq > confirmSeq && revealed >= confirmSeq;
          return (
            <div key={`h-${def.id}`} className={`tl-colhead ${watched ? 'is-watched' : ''}`} style={{ gridColumn: seq + 1 }}>
              {String(seq).padStart(2, '0')}
              {diffStepIds?.has(def.id) && (
                <span className="diff-mark" title="Resultado diferente entre as execuções">
                  ≠
                </span>
              )}
            </div>
          );
        })}

        {LANES.map((lane, li) => {
          const Icon = lane.icon;
          return [
            <div key={`l-${lane.id}`} className="tl-lane" style={{ gridRow: li + 2 }}>
              <span className="tl-lane-icon">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span>
                <span className="tl-lane-name">{lane.name}</span>
                <br />
                <span className="tl-lane-sub">{lane.sub}</span>
              </span>
            </div>,
            <div key={`t-${lane.id}`} className="tl-track" style={{ gridRow: li + 2, gridColumn: `2 / ${cols + 2}` }} aria-hidden="true" />,
          ];
        })}

        <div className="tl-footer-row" style={{ gridRow: LANES.length + 2, gridColumn: 1 }} aria-hidden="true" />
        {showWatched && (
          <div className="tl-watched" style={{ gridRow: `2 / ${LANES.length + 3}`, gridColumn: `${confirmSeq + 2} / ${cols + 2}` }} aria-hidden="true">
            <span className="tl-watched-label">zona vigiada · leituras após a exclusão confirmada</span>
          </div>
        )}

        {scenario.steps.map((def, i) => {
          const seq = i + 1;
          const row = LANES.findIndex((l) => l.id === def.lane) + 2;
          const obs = steps.find((s) => s.seq === seq);
          const shown = obs && seq <= revealed;
          const style = { gridColumn: seq + 1, gridRow: row };

          if (!shown) {
            const isNext = nextStepId === def.id && !obs;
            return (
              <div key={def.id} className="tl-cell" style={style}>
                <div className={`node is-pending ${isNext ? 'is-next' : ''}`} aria-label={`Etapa ${seq}: ${def.title} (${isNext ? 'próxima' : 'pendente'})`}>
                  <span className="node-lane">{LANES[row - 2]!.name} · </span>
                  <span className="node-title">{def.title}</span>
                  <span className="node-code">{isNext ? 'próxima' : 'aguardando'}</span>
                </div>
              </div>
            );
          }

          const n = describeStep(obs, verdict);
          const selected = selectedSeq === seq;
          return (
            <div key={def.id} className="tl-cell" style={style}>
              <button
                ref={(el) => {
                  if (el) refs.current.set(seq, el);
                  else refs.current.delete(seq);
                }}
                type="button"
                className={`node tone tone-${n.tone} revealed ${obs.status === 'skipped' ? 'is-skipped' : ''}`}
                aria-pressed={selected}
                tabIndex={seq === focusSeq ? 0 : -1}
                aria-label={`Etapa ${seq}: ${def.title}. ${n.headline}`}
                onClick={() => onSelect(seq)}
                onKeyDown={(e) => move(e, seq)}
              >
                <span className="node-top">
                  <ToneIcon tone={n.tone} size={14} />
                  <span className="node-title">
                    <span className="node-lane">{LANES[row - 2]!.name} · </span>
                    {def.title}
                  </span>
                </span>
                <span className="node-code">{stepCode(obs).replace(/_/g, '_\u200b')}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
