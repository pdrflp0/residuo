import type { RunDetail } from '@residuo/contracts';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getComparison, isFinished } from '../api';
import { useResource } from '../hooks';
import { VERDICT_META } from '../ui';
import { Evidence } from './Evidence';
import { Timeline } from './Timeline';

export function CompareView({ base, candidate }: { base: string; candidate: string }) {
  const { data, error, loading, reload } = useResource(
    () => getComparison(base, candidate),
    [base, candidate],
    (d) => !isFinished(d.base.run) || !isFinished(d.candidate.run),
  );
  const [selectedId, setSelectedId] = useState<string>();
  const diff = useMemo(() => new Set(data?.comparison.steps.filter((s) => s.changed).map((s) => s.stepId)), [data]);

  useEffect(() => {
    if (!selectedId && data && isFinished(data.candidate.run) && diff.size > 0) setSelectedId([...diff][0]);
  }, [data, diff, selectedId]);

  if (loading && !data) return <div className="skeleton" style={{ height: 420 }} aria-busy="true" aria-label="Carregando comparação" />;
  if (error && !data) {
    return (
      <div className="alert error" role="alert">
        {error.message}{' '}
        <button type="button" className="btn btn-sm" onClick={reload}>
          Tentar de novo
        </button>
      </div>
    );
  }
  if (!data) return null;

  const { comparison: cmp } = data;
  const bothFinished = isFinished(data.base.run) && isFinished(data.candidate.run);
  const sameSetup = cmp.reasons.every((r) => !r.includes('diferentes'));
  const modesDiffer = data.base.run.config.mode !== data.candidate.run.config.mode;
  const sides: [string, RunDetail][] = [
    ['A', data.base],
    ['B', data.candidate],
  ];

  return (
    <>
      <nav className="crumbs" aria-label="Navegação">
        <a href="#/">
          <ArrowLeft size={14} aria-hidden="true" /> Início
        </a>
        <span>/</span>
        <span>comparação</span>
      </nav>

      <div className="run-head">
        <div>
          <div className="eyebrow">{sameSetup && modesDiffer ? 'Mesmo cenário, mesma semente, outro modo do alvo' : 'Comparação de execuções'}</div>
          <h1>{data.base.scenario.title}</h1>
          {bothFinished && !cmp.comparable && (
            <div className="alert warn" style={{ marginTop: 12 }}>
              Execuções não comparáveis diretamente: {cmp.reasons.join(', ')}.
            </div>
          )}
        </div>
      </div>

      <div className="compare-head">
        <SideCard detail={data.base} tag="A" />
        <div className="compare-arrow" aria-hidden="true">
          <ArrowRight size={22} />
        </div>
        <SideCard detail={data.candidate} tag="B" />
      </div>

      <p className="muted" style={{ marginTop: -6 }}>
        {!bothFinished
          ? 'Aguardando as duas execuções terminarem para comparar.'
          : cmp.resultChanged
            ? `O resultado mudou de ${cmp.base.result} para ${cmp.candidate.result}. ${diff.size} etapa(s) divergiram (marcadas com ≠).`
            : 'O resultado não mudou entre as duas execuções.'}
      </p>

      <div className="compare-timelines">
        {sides.map(([tag, d]) => (
          <section key={tag} className="panel timeline-wrap" aria-label={`Linha do tempo ${tag}: ${d.run.config.mode}`}>
            <div className="compare-label">
              <strong>{tag}</strong>
              <span className="chip plain">modo {d.run.config.mode}</span>
              <a href={`#/runs/${d.run.id}`} className="small mono">
                {d.run.id}
              </a>
            </div>
            <Timeline
              scenario={d.scenario}
              steps={d.steps}
              verdict={d.run.verdict}
              revealed={d.steps.length}
              selectedSeq={d.steps.find((s) => s.stepId === selectedId)?.seq}
              onSelect={(seq) => setSelectedId(d.steps.find((s) => s.seq === seq)?.stepId)}
              diffStepIds={diff}
              label={`Linha do tempo ${tag} (${d.run.config.mode})`}
            />
          </section>
        ))}
      </div>

      <div className="evidence-pair">
        {sides.map(([tag, d]) => (
          <Evidence
            key={tag}
            heading={`${tag} · ${d.run.config.mode}`}
            step={d.steps.find((s) => s.stepId === selectedId)}
            scenario={d.scenario}
            verdict={d.run.verdict}
            compact
          />
        ))}
      </div>
    </>
  );
}

function SideCard({ detail, tag }: { detail: RunDetail; tag: string }) {
  const v = detail.run.verdict;
  const meta = v ? VERDICT_META[v.result] : undefined;
  const Icon = meta?.icon;
  return (
    <div className={`compare-card tone tone-${meta?.tone ?? 'neutral'}`}>
      <div className="eyebrow">
        {tag} · modo {detail.run.config.mode}
      </div>
      <div className="result">
        {Icon && <Icon size={18} aria-hidden="true" />}
        {meta?.label ?? 'executando…'}
      </div>
      <div className="small muted" style={{ marginTop: 4 }}>
        {v?.summary ?? `${detail.steps.length} de ${detail.scenario.steps.length} etapas registradas`}
      </div>
    </div>
  );
}
