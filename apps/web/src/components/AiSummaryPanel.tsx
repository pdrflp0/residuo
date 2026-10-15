import type { AiSummary, Run } from '@residuo/contracts';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { getAbout, isFinished, summarizeRun } from '../api';
import { useResource } from '../hooks';

interface Props {
  run: Run;
  summary?: AiSummary;
  onJump: (seq: number) => void;
  onChange: () => void;
}

/** Resumo opcional escrito por IA. Só explica: o veredito exibido acima vem do avaliador. */
export function AiSummaryPanel({ run, summary, onJump, onChange }: Props) {
  const about = useResource(getAbout, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!isFinished(run) || !run.verdict) return null;
  const ai = about.data?.ai;

  const generate = async (refresh: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      await summarizeRun(run.id, refresh);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel panel-pad ai-panel" style={{ marginTop: 18 }} aria-label="Resumo com IA" aria-busy={busy}>
      <div className="section-head">
        <div>
          <h2 className="ai-title">
            <Sparkles size={16} aria-hidden="true" /> Resumo com IA
          </h2>
          <div className="muted small">Explica esta execução citando as etapas. O veredito acima não depende dele.</div>
        </div>
        {summary ? (
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy || !ai?.enabled} onClick={() => generate(true)}>
            <RefreshCw size={14} aria-hidden="true" /> {busy ? 'Gerando…' : 'Gerar de novo'}
          </button>
        ) : (
          <button type="button" className="btn btn-sm" disabled={busy || !ai?.enabled} onClick={() => generate(false)}>
            <Sparkles size={14} aria-hidden="true" /> {busy ? 'Gerando…' : 'Gerar resumo'}
          </button>
        )}
      </div>

      {!summary && ai && !ai.enabled && (
        <p className="small muted ai-note">
          Desligado. Para ligar, inicie a API com <code>ANTHROPIC_API_KEY</code> definida. Ao gerar, o relatório sanitizado desta execução é enviado à API da
          Anthropic.
        </p>
      )}
      {!summary && ai?.enabled && (
        <p className="small muted ai-note">Ao gerar, o relatório sanitizado desta execução é enviado à API da Anthropic ({ai.model}).</p>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      {summary && (
        <>
          <p className="ai-headline">{summary.headline}</p>
          <ul className="ai-list">
            {summary.findings.map((f, i) => (
              <li key={i}>
                {f.text} <Cites steps={f.steps} onJump={onJump} />
              </li>
            ))}
          </ul>
          {summary.nextSteps.length > 0 && (
            <>
              <h3 className="ai-sub">O que investigar</h3>
              <ul className="ai-list">
                {summary.nextSteps.map((f, i) => (
                  <li key={i}>
                    {f.text} <Cites steps={f.steps} onJump={onJump} />
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="small muted ai-note">
            Escrito por <span className="mono">{summary.model}</span>. Conferido por código: repete o veredito do avaliador e todas as citações apontam para etapas
            desta execução. A interpretação pode errar; confira a evidência.
          </p>
        </>
      )}
    </section>
  );
}

function Cites({ steps, onJump }: { steps: number[]; onJump: (seq: number) => void }) {
  return (
    <>
      {steps.map((seq) => (
        <button key={seq} type="button" className="cite" onClick={() => onJump(seq)} aria-label={`Ver a evidência da etapa ${seq}`}>
          etapa {seq}
        </button>
      ))}
    </>
  );
}
