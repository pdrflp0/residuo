import { C, MONO } from '../theme';
import { Body, Chip, Logo, Paper, useEnter } from '../ui';

export const L3_OUTRO_FRAMES = 180;

const NEW = ['backup restaurado', 'cache e busca', 'relatório HTML', 'até 4 clientes', 'resumo com IA conferido'];

export function L3Outro() {
  const logo = useEnter(0, 14);
  const link = useEnter(56);
  return (
    <Paper>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 30, opacity: logo, transform: `scale(${0.85 + logo * 0.15})` }}>
          <Logo size={110} />
          <div style={{ fontSize: 112, fontWeight: 600, letterSpacing: '-0.03em' }}>Resíduo</div>
        </div>
        <div style={{ height: 18 }} />
        <Body delay={10} size={38}>
          Nível 3: outros caminhos para o dado voltar
        </Body>
        <div style={{ height: 44 }} />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1500 }}>
          {NEW.map((s, i) => (
            <Item key={s} label={s} delay={20 + i * 5} />
          ))}
        </div>
        <div style={{ height: 56 }} />
        <div
          style={{
            opacity: link,
            transform: `translateY(${(1 - link) * 20}px)`,
            fontFamily: MONO,
            fontSize: 44,
            fontWeight: 500,
            padding: '18px 34px',
            borderRadius: 16,
            background: C.ink,
            color: C.paper,
          }}
        >
          github.com/pdrflp0/residuo
        </div>
        <div style={{ height: 26 }} />
        <Body delay={70} size={30} style={{ color: C.ink3 }}>
          Pedro Felipe · código aberto
        </Body>
      </div>
    </Paper>
  );
}

function Item({ label, delay }: { label: string; delay: number }) {
  const p = useEnter(delay);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
      <Chip style={{ fontSize: 28, padding: '10px 22px', background: C.panel, border: `1.5px solid ${C.rule}` }}>{label}</Chip>
    </div>
  );
}
