import type { Mode } from '@residuo/contracts';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FastForward, GitCompareArrows, Pause, Play, RefreshCw, SkipForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { advanceRun, counterpartRun, getRun, isFinished, regressionUrl, replayRun, reportUrl } from '../api';
import { go, usePlayback, useResource } from '../hooks';
import { EntityCards } from './EntityCards';
import { Evidence } from './Evidence';
import { Timeline } from './Timeline';
import { VerdictBanner } from './Verdict';

export function RunView({ id, motion }: { id: string; motion: boolean }) {
  const { data, error, loading, reload } = useResource(() => getRun(id), [id], (d) => !isFinished(d.run));
  const [selected, setSelected] = useState<number>();
  const [busy, setBusy] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const evidenceRef = useRef<HTMLDivElement>(null);
  const userPicked = useRef(false);

  const manual = data?.run.config.stepMode === 'manual';
  const steps = data?.steps ?? [];
  const play = usePlayback(steps.length, motion && !manual);
  const revealed = manual ? steps.length : play.revealed;

  useEffect(() => {
    setSelected(undefined);
    userPicked.current = false;
  }, [id]);

  // Ao terminar a reprodução, seleciona a etapa mais relevante (sem roubar uma escolha do usuário).
  useEffect(() => {
    if (!data || userPicked.current) return;
    const v = data.run.verdict;
    if (v && revealed === steps.length) {
      const target = v.violations[0]?.observedAtSeq ?? v.allowances[0]?.observedAtSeq ?? steps.find((s) => s.status !== 'ok' && s.status !== 'skipped')?.seq ?? steps.at(-1)?.seq;
      if (target) setSelected(target);
    } else if (revealed > 0) {
      setSelected(revealed);
    }
  }, [data, revealed, steps]);

  if (loading && !data) return <RunSkeleton />;
  if (error && !data) {
    return (
      <div className="alert error" role="alert">
        <span>
          {error.message}{' '}
          <button type="button" className="btn btn-sm" onClick={reload}>
            Tentar de novo
          </button>
        </span>
      </div>
    );
  }
  if (!data) return null;

  const { run, scenario } = data;
  const finished = isFinished(run);
  const other: Mode = run.config.mode === 'vulnerable' ? 'guarded' : 'vulnerable';

  const jump = (seq: number) => {
    userPicked.current = true;
    play.skip();
    setSelected(seq);
    requestAnimationFrame(() => evidenceRef.current?.scrollIntoView({ behavior: motion ? 'smooth' : 'auto', block: 'start' }));
  };

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setActionError(undefined);
    try {
      await fn();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      <nav className="crumbs" aria-label="Navegação">
        <a href="#/">
          <ArrowLeft size={14} aria-hidden="true" /> Início
        </a>
        <span>/</span>
        <span className="mono">{run.id}</span>
      </nav>

      <div className="run-head">
        <div>
          <div className="eyebrow">Cenário · {scenario.id} v{scenario.version}</div>
          <h1>{scenario.title}</h1>
          <p className="muted" style={{ margin: '6px 0 0', maxWidth: '80ch' }}>
            {scenario.summary}
          </p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!finished || !!busy}
            onClick={() =>
              act('counterpart', async () => {
                const r = await counterpartRun(run.id, other);
                go(run.config.mode === 'vulnerable' ? `/compare/${run.id}/${r.id}` : `/compare/${r.id}/${run.id}`);
              })
            }
          >
            <GitCompareArrows size={15} aria-hidden="true" /> {busy === 'counterpart' ? 'Executando…' : `Repetir em ${other} e comparar`}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!finished || !!busy}
            onClick={() =>
              act('replay', async () => {
                const r = await replayRun(run.id);
                go(`/runs/${r.id}`);
              })
            }
          >
            <RefreshCw size={15} aria-hidden="true" /> Reexecutar igual
          </button>
        </div>
      </div>

      {actionError && (
        <div className="alert error" role="alert">
          {actionError}
        </div>
      )}

      <VerdictBanner run={run} steps={steps} total={scenario.steps.length} onJump={jump} />

      <EntityCards entityId={run.entityId} steps={steps} revealed={revealed} verdict={run.verdict} />

      <section className="panel timeline-wrap" aria-label="Linha do tempo">
        <div className="timeline-toolbar">
          <div>
            <h2>Linha do tempo</h2>
            <div className="timeline-note">Reprodução das observações gravadas. A animação não decide o resultado.</div>
          </div>
          {!manual && (
            <div className="playbar" role="group" aria-label="Controles de reprodução">
              <button type="button" className="icon-btn" aria-label="Etapa anterior" disabled={revealed <= 1} onClick={() => play.stepTo(revealed - 1)}>
                <ChevronLeft size={16} />
              </button>
              {play.playing ? (
                <button type="button" className="icon-btn" aria-label="Pausar reprodução" onClick={play.pause}>
                  <Pause size={16} />
                </button>
              ) : (
                <button type="button" className="icon-btn" aria-label="Reproduzir do início" onClick={play.play} disabled={!motion}>
                  <Play size={16} />
                </button>
              )}
              <button type="button" className="icon-btn" aria-label="Próxima etapa" disabled={revealed >= steps.length} onClick={() => play.stepTo(revealed + 1)}>
                <ChevronRight size={16} />
              </button>
              <button type="button" className="icon-btn" aria-label="Mostrar tudo" disabled={revealed >= steps.length} onClick={play.skip}>
                <FastForward size={16} />
              </button>
              <span className="counter" aria-live="polite">
                {revealed}/{scenario.steps.length}
              </span>
            </div>
          )}
        </div>

        {manual && run.status === 'paused' && (
          <div className="manual-bar">
            <span>
              Barreira manual: a próxima etapa é <strong>{scenario.steps.find((s) => s.id === run.nextStepId)?.title}</strong>. Nada acontece no alvo até você
              avançar.
            </span>
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() =>
                act('advance', async () => {
                  await advanceRun(run.id);
                  reload();
                })
              }>
              <SkipForward size={15} aria-hidden="true" /> Avançar etapa
            </button>
          </div>
        )}

        <Timeline
          scenario={scenario}
          steps={steps}
          verdict={run.verdict}
          revealed={revealed}
          selectedSeq={selected}
          onSelect={(seq) => {
            userPicked.current = true;
            setSelected(seq);
          }}
          {...(run.nextStepId ? { nextStepId: run.nextStepId } : {})}
          label={`Linha do tempo de ${run.id}`}
        />
      </section>

      <div ref={evidenceRef} style={{ scrollMarginTop: 16 }}>
        <Evidence step={steps.find((s) => s.seq === selected && s.seq <= revealed)} scenario={scenario} verdict={run.verdict} onJump={jump} />
      </div>

      <section className="panel panel-pad" style={{ marginTop: 18 }} aria-label="Exportar">
        <div className="section-head">
          <div>
            <h2>Exportar evidência</h2>
            <div className="muted small">Relatório reproduzível com configuração, linha do tempo, evidências e limites. O HTML abre em qualquer navegador, sem instalar nada.</div>
          </div>
        </div>
        <div className="btn-row">
          <a className="btn btn-primary" href={reportUrl(run.id, 'html')} download aria-disabled={!finished}>
            <Download size={15} aria-hidden="true" /> Relatório HTML (compartilhável)
          </a>
          <a className="btn" href={reportUrl(run.id, 'md')} download aria-disabled={!finished}>
            <Download size={15} aria-hidden="true" /> Relatório Markdown
          </a>
          <a className="btn" href={reportUrl(run.id, 'json')} download aria-disabled={!finished}>
            <Download size={15} aria-hidden="true" /> Relatório JSON
          </a>
          <a className="btn" href={regressionUrl(run.id)} download aria-disabled={!finished}>
            <Download size={15} aria-hidden="true" /> Teste de regressão (.ts)
          </a>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Reproduzir pela linha de comando:{' '}
          <code>
            npm run lab -- --scenario {run.config.scenarioId} --mode {run.config.mode} --policy {run.config.policy} --seed {run.config.seed} --fault{' '}
            {run.config.fault} --timeout {run.config.timeoutMs}
          </code>
        </p>
      </section>
    </>
  );
}

function RunSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando execução">
      <div className="skeleton" style={{ height: 28, width: 280, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 120, marginBottom: 18 }} />
      <div className="skeleton" style={{ height: 380 }} />
    </div>
  );
}
