import type { ReactNode } from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { ease, Highlight } from '../ui';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Altura (px CSS) da faixa de cartões no topo da captura da bancada. */
export const CARDS_H = 132;

export interface Mark {
  step: number;
  from: number;
  to?: number;
  color?: string;
  label?: ReactNode;
  labelSide?: 'top' | 'bottom' | 'left' | 'right';
  pulse?: boolean;
}

/**
 * Captura real da bancada (cartões + linha do tempo) no estado final. Véus escondem o que
 * ainda não aconteceu (etapas futuras, zona vigiada, cartões com o resultado) e somem no
 * quadro em que a etapa "acontece" no vídeo. Os destaques usam a geometria medida na captura.
 */
export function Bench({
  src,
  width,
  bench,
  reveal,
  zoneAt,
  cardsAt,
  marks,
}: {
  src: string;
  width: number;
  bench: { w: number; h: number; nodes: Record<string, Box | null>; watched: Box | null };
  reveal: Record<number, number>;
  zoneAt: number;
  cardsAt: number;
  marks: Mark[];
}) {
  const frame = useCurrentFrame();
  const S = width / bench.w;
  const fade = (at: number) => 1 - ease(frame, [at, at + 12], [0, 1]);
  const z = bench.watched;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Img src={staticFile(`shots/l3/${src}`)} style={{ position: 'absolute', left: 0, top: 0, width }} />
      {/* cartões com o resultado: só no fim */}
      <div style={{ position: 'absolute', left: 0, top: 0, width, height: CARDS_H * S, background: C.paper, opacity: fade(cardsAt) }} />
      {z && <div style={{ position: 'absolute', left: z.x * S, top: z.y * S, width: z.w * S + 4, height: z.h * S + 30 * S, background: C.panel, opacity: fade(zoneAt) * 0.94 }} />}
      {Object.entries(bench.nodes).map(([k, b]) => {
        if (!b) return null;
        const o = fade(reveal[Number(k)] ?? 0);
        if (o < 0.01) return null;
        return <div key={k} style={{ position: 'absolute', left: b.x * S - 6, top: b.y * S - 6, width: b.w * S + 12, height: b.h * S + 12, background: C.panel, opacity: o * 0.93, borderRadius: 10 }} />;
      })}
      {marks.map((m, i) => {
        const b = bench.nodes[String(m.step)];
        if (!b) return null;
        const o = ease(frame, [m.from, m.from + 10], [0, 1]) * (m.to === undefined ? 1 : ease(frame, [m.to, m.to + 10], [1, 0]));
        if (o < 0.01) return null;
        return (
          <Highlight
            key={i}
            x={b.x * S}
            y={b.y * S}
            w={b.w * S}
            h={b.h * S}
            color={m.color ?? C.ink}
            {...(m.label ? { label: m.label } : {})}
            labelSide={m.labelSide ?? 'top'}
            opacity={o}
            pulse={m.pulse ?? false}
          />
        );
      })}
    </div>
  );
}

/** Coluna de texto da esquerda, trocando de fase. */
export function Phases({ phases, eyebrow }: { phases: { at: number; title: string; body: string; color?: string }[]; eyebrow: string }) {
  const frame = useCurrentFrame();
  const phase = [...phases].reverse().find((p) => frame >= p.at) ?? phases[0]!;
  const p = ease(frame, [phase.at, phase.at + 12], [0, 1]);
  return (
    <div style={{ position: 'absolute', left: 90, top: 230, width: 470 }}>
      <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 22, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.ink3 }}>{eyebrow}</div>
      <div style={{ height: 30 }} />
      <div style={{ opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
        <div style={{ fontSize: 52, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.02em', color: phase.color ?? C.ink }}>{phase.title}</div>
        <div style={{ fontSize: 31, lineHeight: 1.42, color: C.ink2, marginTop: 20 }}>{phase.body}</div>
      </div>
    </div>
  );
}
