import { C, MONO } from '../theme';
import { Body, Chip, Logo, Paper, useEnter } from '../ui';

export const OUTRO_FRAMES = 195;

const STACK = ['TypeScript', 'NestJS', 'React', 'PostgreSQL', 'Vitest', 'Playwright', 'Docker'];

export function Outro() {
  const logo = useEnter(0, 14);
  const link = useEnter(70);
  return (
    <Paper>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 30, opacity: logo, transform: `scale(${0.85 + logo * 0.15})` }}>
          <Logo size={110} />
          <div style={{ fontSize: 112, fontWeight: 600, letterSpacing: '-0.03em' }}>Resíduo</div>
        </div>
        <div style={{ height: 22 }} />
        <Body delay={12} size={38}>
          Laboratório de reaparecimento de registros
        </Body>
        <div style={{ height: 50 }} />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          {STACK.map((s, i) => (
            <StackChip key={s} label={s} delay={24 + i * 5} />
          ))}
        </div>
        <div style={{ height: 34 }} />
        <Body delay={60} size={30}>
          Testes de integração contra PostgreSQL real · corrida real · ponta a ponta com Playwright
        </Body>
        <div style={{ height: 60 }} />
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
        <Body delay={85} size={30} style={{ color: C.ink3 }}>
          Pedro Felipe · código aberto
        </Body>
      </div>
    </Paper>
  );
}

function StackChip({ label, delay }: { label: string; delay: number }) {
  const p = useEnter(delay);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
      <Chip style={{ fontSize: 28, padding: '10px 22px', background: C.panel, border: `1.5px solid ${C.rule}` }}>{label}</Chip>
    </div>
  );
}
