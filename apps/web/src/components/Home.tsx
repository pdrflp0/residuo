import { FAULTS, type Fault, type Mode, type Policy, POLICIES, type Run } from '@residuo/contracts';
import { FlaskConical, Play } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { createRun, getScenarios, listRuns } from '../api';
import { go, useResource } from '../hooks';
import { FAULT_LABEL, MODE_LABEL, POLICY_LABEL, timeAgo, ToneIcon, VERDICT_META, VerdictChip } from '../ui';

export function Home() {
  const scenarios = useResource(getScenarios, []);
  const runs = useResource(() => listRuns(12), [], (rs) => rs.some((r) => r.status === 'running' || r.status === 'queued'), 1000);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  const startDemo = async () => {
    setStarting(true);
    setError(undefined);
    try {
      const run = await createRun({ scenarioId: 'held-update-after-delete', mode: 'vulnerable' });
      go(`/runs/${run.id}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  };

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Laboratório de reaparecimento · nível 1</div>
          <h1>Um registro apagado pode voltar sozinho?</h1>
          <p>
            O Resíduo executa uma sequência controlada contra um serviço de teste real: cria um registro, retém uma edição antiga, exclui, confirma e
            só então libera a edição. Depois lê o registro de novo e mostra, com evidência, se ele reapareceu e qual operação o trouxe de volta.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary btn-lg" onClick={startDemo} disabled={starting}>
              <Play size={17} aria-hidden="true" /> {starting ? 'Iniciando…' : 'Rodar a demonstração'}
            </button>
            <a className="btn btn-lg btn-ghost" href="#configurar">
              Configurar outro cenário
            </a>
          </div>
          {error && (
            <div className="alert error" role="alert" style={{ marginTop: 16 }}>
              {error}
            </div>
          )}
        </div>
        <ol className="story" aria-label="O que a demonstração mostra">
          <li className="tone tone-live">
            <span className="story-icon">
              <ToneIcon tone="live" />
            </span>
            <span>
              A ficha <code>item-17</code> é criada
              <small>geração g1, revisão 1</small>
            </span>
          </li>
          <li className="tone tone-neutral">
            <span className="story-icon">
              <ToneIcon tone="neutral" />
            </span>
            <span>
              Um cliente offline edita, mas o envio fica retido
              <small>a edição parte da revisão 1</small>
            </span>
          </li>
          <li className="tone tone-deleted">
            <span className="story-icon">
              <ToneIcon tone="deleted" />
            </span>
            <span>
              Outro cliente exclui e o serviço confirma
              <small>a partir daqui, g1 não pode voltar</small>
            </span>
          </li>
          <li className="tone tone-reappeared">
            <span className="story-icon">
              <ToneIcon tone="reappeared" />
            </span>
            <span>
              A edição antiga chega… e o registro voltou?
              <small>o Resíduo lê e decide com base no que viu</small>
            </span>
          </li>
        </ol>
      </section>

      <div className="home-grid">
        <section className="panel panel-pad" id="configurar" aria-labelledby="cfg-title">
          <div className="section-head">
            <h2 id="cfg-title">
              <FlaskConical size={17} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />
              Configurar execução
            </h2>
            <span className="muted small">alvo: serviço de referência local</span>
          </div>
          {scenarios.error && <div className="alert error">{scenarios.error.message}</div>}
          {scenarios.loading && !scenarios.data && <div className="skeleton" style={{ height: 320 }} />}
          {scenarios.data && <RunForm scenarios={scenarios.data.scenarios} defaultSeed={scenarios.data.defaultSeed} />}
        </section>

        <section className="panel panel-pad" aria-labelledby="hist-title">
          <div className="section-head">
            <h2 id="hist-title">Execuções recentes</h2>
            <span className="muted small">gravadas no banco do laboratório</span>
          </div>
          <History runs={runs.data} loading={runs.loading} error={runs.error} />
        </section>
      </div>

      <section className="explain" aria-label="Como ler os resultados">
        {(Object.keys(VERDICT_META) as (keyof typeof VERDICT_META)[]).map((k) => {
          const m = VERDICT_META[k];
          const Icon = m.icon;
          return (
            <div key={k} className="panel">
              <span className={`chip tone tone-${m.tone}`}>
                <Icon size={13} aria-hidden="true" /> {k}
              </span>
              <p>{EXPLAIN[k]}</p>
            </div>
          );
        })}
      </section>
    </>
  );
}

const EXPLAIN: Record<keyof typeof VERDICT_META, string> = {
  VIOLATION: 'A geração excluída voltou a ser visível numa leitura feita depois da confirmação, sem restauração permitida.',
  NO_VIOLATION_OBSERVED: 'A sequência terminou e as leituras declaradas não viram a geração excluída. Não prova correção universal.',
  INCONCLUSIVE: 'Timeout, falha do adapter ou confirmação não obtida. Nunca é convertido em aprovação.',
  POLICY_ALLOWED: 'Houve reaparecimento que a política permite, com evidência: nova geração explícita ou restauração autorizada.',
};

function RunForm({ scenarios, defaultSeed }: { scenarios: { id: string; title: string; summary: string; defaultPolicy: Policy }[]; defaultSeed: number }) {
  const [scenarioId, setScenarioId] = useState(scenarios[0]!.id);
  const [mode, setMode] = useState<Mode>('vulnerable');
  const [policy, setPolicy] = useState<Policy>(scenarios[0]!.defaultPolicy);
  const [seed, setSeed] = useState(defaultSeed);
  const [fault, setFault] = useState<Fault>('none');
  const [manual, setManual] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const s = scenarios.find((x) => x.id === scenarioId);
    if (s) setPolicy(s.defaultPolicy);
  }, [scenarioId, scenarios]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const run = await createRun({ scenarioId, mode, policy, seed, fault, stepMode: manual ? 'manual' : 'auto' });
      go(`/runs/${run.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <form className="form-grid" onSubmit={submit}>
      <fieldset className="field">
        <legend>Cenário</legend>
        <div className="scenario-options">
          {scenarios.map((s) => (
            <label key={s.id} className="scenario-option">
              <input type="radio" name="scenario" value={s.id} checked={scenarioId === s.id} onChange={() => setScenarioId(s.id)} />
              <span>
                <strong>{s.title}</strong>
                <span>{s.summary}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Modo do serviço de referência</legend>
        <div className="segmented">
          {(['vulnerable', 'guarded'] as const).map((m) => (
            <label key={m}>
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              {m}
            </label>
          ))}
        </div>
        <div className="hint">{MODE_LABEL[mode]}</div>
      </fieldset>

      <div className="two-col">
        <div className="field">
          <label htmlFor="policy">Política declarada</label>
          <select id="policy" value={policy} onChange={(e) => setPolicy(e.target.value as Policy)}>
            {POLICIES.map((p) => (
              <option key={p} value={p}>
                {p} — {POLICY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="seed">Semente</label>
          <input id="seed" type="number" min={0} value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          <div className="hint">gera só os dados sintéticos (id e conteúdo)</div>
        </div>
      </div>

      <details className="advanced">
        <summary>Opções avançadas</summary>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="fault">Falha injetada no alvo</label>
            <select id="fault" value={fault} onChange={(e) => setFault(e.target.value as Fault)}>
              {FAULTS.map((f) => (
                <option key={f} value={f}>
                  {FAULT_LABEL[f]}
                </option>
              ))}
            </select>
            <div className="hint">Para ver o engine recusar uma conclusão sem evidência.</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
            Avançar etapa por etapa (barreira manual)
          </label>
        </div>
      </details>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          <Play size={15} aria-hidden="true" /> {submitting ? 'Iniciando…' : 'Executar'}
        </button>
      </div>
    </form>
  );
}

function History({ runs, loading, error }: { runs?: Run[]; loading: boolean; error?: Error }) {
  const [picked, setPicked] = useState<string[]>([]);
  if (error) return <div className="alert error">{error.message}</div>;
  if (loading && !runs) return <div className="skeleton" style={{ height: 240 }} />;
  if (!runs || runs.length === 0) {
    return <div className="empty">Nenhuma execução ainda. Rode a demonstração para começar.</div>;
  }
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));

  return (
    <>
      <ul className="history">
        {runs.map((r) => {
          const tone = r.verdict ? VERDICT_META[r.verdict.result].tone : 'neutral';
          return (
            <li key={r.id}>
              <input type="checkbox" aria-label={`Selecionar ${r.id} para comparar`} checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />
              <a href={`#/runs/${r.id}`}>
                <div className="history-title">
                  <ToneIcon tone={tone} size={13} /> {r.scenarioId}
                </div>
                <div className="history-meta">
                  {r.config.mode} · {r.config.policy} · semente {r.config.seed} · {timeAgo(r.createdAt)}
                </div>
              </a>
              <VerdictChip {...(r.verdict ? { result: r.verdict.result } : {})} />
            </li>
          );
        })}
      </ul>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-sm" disabled={picked.length !== 2} onClick={() => go(`/compare/${picked[0]}/${picked[1]}`)}>
          Comparar selecionadas ({picked.length}/2)
        </button>
      </div>
    </>
  );
}
