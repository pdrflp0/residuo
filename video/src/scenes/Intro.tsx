import { ArrowRight } from 'lucide-react';
import { C } from '../theme';
import { Body, Chip, Eyebrow, Headline, Logo, Paper, useEnter } from '../ui';

export const INTRO_FRAMES = 240;

const PIPELINE = ['Criar', 'Preparar edição', 'Reter envio', 'Apagar', 'Confirmar', 'Liberar', 'Ler de novo'];

/** Apresenta o Resíduo: o que é e a sequência que ele executa. */
export function Intro() {
  const logo = useEnter(0, 14);
  return (
    <Paper>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34, opacity: logo, transform: `scale(${0.8 + logo * 0.2})` }}>
          <Logo size={130} />
          <div style={{ fontSize: 132, fontWeight: 600, letterSpacing: '-0.03em' }}>Resíduo</div>
        </div>
        <div style={{ height: 44 }} />
        <Headline delay={18} size={58} style={{ maxWidth: 1500 }}>
          Um laboratório que provoca esse bug de propósito
          <br />e <span style={{ color: C.reappeared }}>prova</span> o que aconteceu.
        </Headline>
        <div style={{ height: 70 }} />
        <Eyebrow delay={50}>a sequência controlada</Eyebrow>
        <div style={{ height: 26 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1700 }}>
          {PIPELINE.map((label, i) => (
            <PipelineChip key={label} label={label} i={i} last={i === PIPELINE.length - 1} />
          ))}
        </div>
        <div style={{ height: 60 }} />
        <Body delay={150} size={34}>
          Contra um serviço real com PostgreSQL, em dois modos: <b style={{ color: C.reappeared }}>vulnerable</b> (com o bug) e{' '}
          <b style={{ color: C.live }}>guarded</b> (corrigido).
        </Body>
      </div>
    </Paper>
  );
}

function PipelineChip({ label, i, last }: { label: string; i: number; last: boolean }) {
  const p = useEnter(60 + i * 9);
  const tone = label === 'Apagar' || label === 'Confirmar' ? [C.deleted, C.deletedBg] : last ? [C.reappeared, C.reappearedBg] : label.includes('edição') || label.includes('envio') ? [C.conflict, C.conflictBg] : [C.live, C.liveBg];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
      <Chip color={tone[0]} bg={tone[1]} style={{ fontSize: 30, padding: '12px 24px' }}>
        {label}
      </Chip>
      {!last && <ArrowRight size={28} color={C.ink3} />}
    </div>
  );
}
