import geometry from '../../public/shots/l3/geometry.json';
import { C } from '../theme';
import { BrowserFrame, Paper } from '../ui';
import { Bench, Phases } from './Bench';

export const BACKUP_FRAMES = 420;

const W = 1260;
const g = geometry.backup;
const s = g.seqs;

const PHASES = [
  { at: 0, title: 'Backup restaurado', body: 'Um backup é feito enquanto o registro ainda existe.' },
  { at: 87, title: 'Apaga e confirma.', body: 'A exclusão de g1 está valendo. Daqui pra frente, ele não pode voltar.' },
  { at: 195, title: 'Alguém restaura o backup de ontem.', body: 'Uma operação legítima, depois de um incidente qualquer.' },
  { at: 285, title: 'E o registro volta junto.', body: `A leitura vê g1 de novo. O alvo informa quem escreveu por último: a restauração (etapa ${s['restore-snapshot']}).`, color: C.reappeared },
];

/** Caminho 1: backup restaurado traz de volta o que foi apagado depois dele. Captura real. */
export function Backup() {
  return (
    <Paper>
      <Phases eyebrow="caminho 1" phases={PHASES} />
      <BrowserFrame x={600} y={150} width={W} height={Math.round(g.bench.h * (W / g.bench.w)) + 70} url={`localhost:5173/#/runs/${g.runId}`}>
        <Bench
          src="backup-bench.png"
          width={W}
          bench={g.bench}
          reveal={{ [s.create]: 12, [s.snapshot]: 30, [s['inspect-before']]: 48, [s.delete]: 90, [s.confirm]: 106, [s['inspect-deleted']]: 140, [s['restore-snapshot']]: 198, [s['inspect-after']]: 285 }}
          zoneAt={116}
          cardsAt={300}
          marks={[
            { step: s.snapshot, from: 34, to: 84, label: 'backup com g1', labelSide: 'bottom' },
            { step: s.confirm, from: 110, to: 190, color: C.deleted, label: 'exclusão confirmada', labelSide: 'bottom' },
            { step: s['restore-snapshot'], from: 205, to: 282, color: C.reappeared, label: 'SNAPSHOT_RESTORED', labelSide: 'left' },
            { step: s['restore-snapshot'], from: 282, color: C.reappeared },
            { step: s['inspect-after'], from: 290, color: C.reappeared, label: 'g1 visível de novo', labelSide: 'bottom', pulse: true },
          ]}
        />
      </BrowserFrame>
    </Paper>
  );
}
