import { BadgeCheck, CircleHelp, Eye, FileText, Ghost, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { C, MONO } from '../theme';
import { Chip, Eyebrow, Headline, Paper, useEnter } from '../ui';

export const PRINCIPLES_FRAMES = 255;

/** As três ideias que sustentam o veredito. */
export function Principles() {
  return (
    <Paper>
      <div style={{ position: 'absolute', left: 150, top: 90 }}>
        <Eyebrow>o que torna o veredito confiável</Eyebrow>
        <div style={{ height: 14 }} />
        <Headline size={64}>Três regras do Resíduo</Headline>
      </div>

      <div style={{ position: 'absolute', left: 150, right: 150, top: 300, display: 'flex', gap: 30 }}>
        <Card delay={12} title="Geração ≠ ID">
          <Row icon={<Trash2 size={28} />} color={C.deleted} bg={C.deletedBg} text="item-17 · g1 — apagada" strike />
          <Row icon={<Sparkles size={28} />} color={C.newer} bg={C.newerBg} text="item-17 · g2 — nova, legítima" />
          <Note>Criar de novo não é ressurreição. O bug é a g1 voltar.</Note>
        </Card>
        <Card delay={42} title="Escrita ≠ evidência">
          <Row icon={<FileText size={28} />} color={C.ink2} bg={C.paper2} text="o serviço diz: UPSERT_INSERTED" mono />
          <Row icon={<Eye size={28} />} color={C.reappeared} bg={C.reappearedBg} text="o Resíduo lê: g1 visível" mono />
          <Note>O veredito vem da leitura feita depois da exclusão confirmada.</Note>
        </Card>
        <Card delay={72} title="Sem prova, sem aprovação">
          <Row icon={<CircleHelp size={28} />} color={C.failure} bg={C.failureBg} text="timeout · sem confirmação" />
          <Row icon={<CircleHelp size={28} />} color={C.failure} bg={C.failureBg} text="→ INCONCLUSIVE" mono />
          <Note>Falta de evidência nunca vira "passou".</Note>
        </Card>
      </div>

      <Verdicts />
    </Paper>
  );
}

function Verdicts() {
  const p = useEnter(130);
  const items: [ReactNode, string, string, string][] = [
    [<Ghost size={26} />, 'VIOLATION', C.reappeared, C.reappearedBg],
    [<ShieldCheck size={26} />, 'NO_VIOLATION_OBSERVED', C.live, C.liveBg],
    [<CircleHelp size={26} />, 'INCONCLUSIVE', C.failure, C.failureBg],
    [<BadgeCheck size={26} />, 'POLICY_ALLOWED', C.newer, C.newerBg],
  ];
  return (
    <div style={{ position: 'absolute', left: 150, right: 150, top: 900, display: 'flex', gap: 18, justifyContent: 'center', opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
      {items.map(([icon, label, color, bg]) => (
        <Chip key={label} color={color} bg={bg} style={{ fontFamily: MONO, fontSize: 26 }}>
          {icon} {label}
        </Chip>
      ))}
    </div>
  );
}

function Card({ delay, title, children }: { delay: number; title: string; children: ReactNode }) {
  const p = useEnter(delay);
  return (
    <div
      style={{
        flex: 1,
        padding: '36px 36px 30px',
        borderRadius: 24,
        background: C.panel,
        border: `1.5px solid ${C.rule}`,
        boxShadow: '0 20px 50px rgba(27,26,23,0.08)',
        opacity: p,
        transform: `translateY(${(1 - p) * 40}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        minHeight: 520,
      }}
    >
      <div style={{ fontSize: 42, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ icon, text, color, bg, strike, mono }: { icon: ReactNode; text: string; color: string; bg: string; strike?: boolean; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        borderRadius: 14,
        background: bg,
        color,
        fontSize: mono ? 24 : 27,
        fontFamily: mono ? MONO : undefined,
        fontWeight: 600,
        textDecoration: strike ? 'line-through' : 'none',
      }}
    >
      {icon}
      {text}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 27, lineHeight: 1.4, color: C.ink2, marginTop: 'auto' }}>{children}</div>;
}
