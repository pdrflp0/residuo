import { Inbox, Lock, ShieldX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { ease, Eyebrow, Headline, Paper, useEnter } from '../ui';

export const COMPARE_FRAMES = 330;

const W = 1500;
const X = (1920 - W) / 2;
const HEAD_H = Math.round((278 / 2544) * W);
const EV_CROP = 300; // px CSS do topo da evidência lado a lado
const EV_S = W / 1272;

/** Mesmo cenário no modo protegido: o resultado muda, com a mesma evidência lado a lado. */
export function Compare() {
  const frame = useCurrentFrame();
  const head = useEnter(14);
  const ev = ease(frame, [60, 80], [0, 1]);
  return (
    <Paper>
      <div style={{ position: 'absolute', left: X, top: 70 }}>
        <Eyebrow>mesmo cenário · mesma semente · modo guarded</Eyebrow>
        <div style={{ height: 14 }} />
        <Headline size={64}>
          O resultado mudou: <span style={{ color: C.live }}>a edição antiga é recusada.</span>
        </Headline>
      </div>

      <Img
        src={staticFile('shots/compare-head.png')}
        style={{ position: 'absolute', left: X, top: 240, width: W, opacity: head, transform: `translateY(${(1 - head) * 20}px)` }}
      />

      <div
        style={{
          position: 'absolute',
          left: X,
          top: 240 + HEAD_H + 30,
          width: W,
          height: EV_CROP * EV_S,
          overflow: 'hidden',
          opacity: ev,
          transform: `translateY(${(1 - ev) * 30}px)`,
          maskImage: 'linear-gradient(to bottom, black 85%, transparent)',
        }}
      >
        <Img src={staticFile('shots/compare-evidence.png')} style={{ width: W }} />
      </div>

      <div style={{ position: 'absolute', left: X, top: 860, width: W, display: 'flex', gap: 22 }}>
        <Mechanism delay={140} icon={<Inbox size={34} />} title="Inbox" text="mensagem repetida é ignorada" />
        <Mechanism delay={160} icon={<Lock size={34} />} title="Lock por identidade" text="exclusão e edição não decidem juntas" />
        <Mechanism delay={180} icon={<ShieldX size={34} />} title="Lápide por geração" text="edição de uma vida encerrada: 409" />
      </div>
    </Paper>
  );
}

function Mechanism({ delay, icon, title, text }: { delay: number; icon: ReactNode; title: string; text: string }) {
  const p = useEnter(delay);
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        gap: 18,
        alignItems: 'center',
        padding: '22px 26px',
        borderRadius: 18,
        background: C.panel,
        border: `2px solid ${C.live}44`,
        boxShadow: `inset 6px 0 0 ${C.live}`,
        opacity: p,
        transform: `translateY(${(1 - p) * 24}px)`,
      }}
    >
      <div style={{ color: C.live, flex: 'none' }}>{icon}</div>
      <div>
        <div style={{ fontSize: 30, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 24, color: C.ink2 }}>{text}</div>
      </div>
    </div>
  );
}
