import geometry from '../../public/shots/l3/geometry.json';
import { C } from '../theme';
import { BrowserFrame, Paper } from '../ui';
import { Bench, Phases } from './Bench';

export const DERIVED_FRAMES = 390;

const W = 1260;
const g = geometry.derived;
const s = g.seqs;

const PHASES = [
  { at: 0, title: 'Cache e busca', body: 'O registro é lido pelo cache e aparece no índice de busca.' },
  { at: 96, title: 'Apagado do banco.', body: 'Exclusão confirmada. A leitura no banco dá 404.' },
  { at: 156, title: 'Mas o cache e o índice ainda mostram.', body: 'Duas leituras depois da exclusão confirmada, e g1 continua lá.', color: C.reappeared },
  { at: 240, title: 'Dado derivado não invalidado.', body: 'O Resíduo vigia cada ponto de leitura e diz onde o dado sobreviveu. Nenhuma escrita explica: falta invalidar.' },
];

/** Caminho 2: o banco apagou, o cache e a busca não. Captura real. */
export function Derived() {
  return (
    <Paper>
      <Phases eyebrow="caminho 2" phases={PHASES} />
      <BrowserFrame x={600} y={190} width={W} height={Math.round(g.bench.h * (W / g.bench.w)) + 80} url={`localhost:5173/#/runs/${g.runId}`}>
        <Bench
          src="derived-bench.png"
          width={W}
          bench={g.bench}
          reveal={{ [s.create]: 12, [s['warm-cache']]: 30, [s['search-before']]: 48, [s.delete]: 96, [s.confirm]: 108, [s['inspect-primary']]: 128, [s['inspect-cache']]: 156, [s['inspect-search']]: 168 }}
          zoneAt={118}
          cardsAt={245}
          marks={[
            { step: s['inspect-primary'], from: 132, color: C.deleted, label: 'banco: ausente', labelSide: 'bottom' },
            { step: s['inspect-cache'], from: 160, color: C.reappeared, label: 'cache: g1', labelSide: 'top', pulse: true },
            { step: s['inspect-search'], from: 172, color: C.reappeared, label: 'busca: g1', labelSide: 'bottom', pulse: true },
          ]}
        />
      </BrowserFrame>
    </Paper>
  );
}
