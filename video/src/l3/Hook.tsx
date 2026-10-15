import { Archive, Database, Layers, Trash2, Ghost } from 'lucide-react';
import type { ComponentType } from 'react';
import { useCurrentFrame } from 'remotion';
import { C, MONO } from '../theme';
import { ease, Eyebrow, Headline, Paper } from '../ui';

export const L3_HOOK_FRAMES = 180;

type Icon = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;

/** "Apagar do banco não basta." — o dado continua em outros lugares. */
export function L3Hook() {
  return (
    <Paper>
      <div style={{ position: 'absolute', left: 150, top: 330, width: 860 }}>
        <Eyebrow>resíduo · nível 3</Eyebrow>
        <div style={{ height: 30 }} />
        <Headline delay={6} size={112}>
          Apagar do banco
        </Headline>
        <Headline delay={40} size={112} color={C.reappeared}>
          não basta.
        </Headline>
      </div>
      <div style={{ position: 'absolute', left: 1080, top: 270, width: 700, display: 'flex', flexDirection: 'column', gap: 26 }}>
        <Place icon={Database} name="Banco de dados" at={4} goneAt={22} />
        <Place icon={Layers} name="Cache e busca" at={78} />
        <Place icon={Archive} name="Backup de ontem" at={96} />
      </div>
    </Paper>
  );
}

function Place({ icon: I, name, at, goneAt }: { icon: Icon; name: string; at: number; goneAt?: number }) {
  const frame = useCurrentFrame();
  const enter = ease(frame, [at, at + 14], [0, 1]);
  const gone = goneAt !== undefined && frame >= goneAt;
  const tone = gone ? C.deleted : C.reappeared;
  const bg = gone ? C.deletedBg : C.reappearedBg;
  const Status = gone ? Trash2 : Ghost;
  const pop = goneAt === undefined ? 1 + 0.05 * (1 - ease(frame, [at + 6, at + 22], [0, 1])) : 1;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 26,
        padding: '28px 34px',
        borderRadius: 22,
        background: C.panel,
        border: `2.5px solid ${tone}44`,
        boxShadow: `inset 8px 0 0 ${tone}, 0 24px 50px rgba(27,26,23,0.10)`,
        opacity: enter,
        transform: `translateX(${(1 - enter) * 60}px) scale(${pop})`,
      }}
    >
      <I size={52} strokeWidth={1.8} color={C.ink2} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 38, fontWeight: 600 }}>{name}</div>
        <div style={{ fontFamily: MONO, fontSize: 24, color: C.ink3, marginTop: 4 }}>item-17 · g1</div>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderRadius: 999, background: bg, color: tone, fontSize: 28, fontWeight: 600 }}>
        <Status size={28} strokeWidth={2.2} />
        {gone ? 'apagado' : 'ainda aqui'}
      </div>
    </div>
  );
}
