import { CircleDot, Ghost, Trash2 } from 'lucide-react';
import { useCurrentFrame } from 'remotion';
import { C, MONO } from '../theme';
import { ease, Eyebrow, Headline, Paper, useEnter } from '../ui';

export const HOOK_FRAMES = 165;

/** "Você apagou. Ele voltou." — o bug em 5 segundos. */
export function Hook() {
  const frame = useCurrentFrame();
  const enter = useEnter(4);
  const deleted = ease(frame, [42, 54], [0, 1]);
  const back = ease(frame, [98, 108], [0, 1]);
  const shake = frame > 92 && frame < 100 ? Math.sin(frame * 3) * 8 : 0;

  const state = back > 0.5 ? 'back' : deleted > 0.5 ? 'deleted' : 'live';
  const tone = state === 'back' ? C.reappeared : state === 'deleted' ? C.deleted : C.live;
  const toneBg = state === 'back' ? C.reappearedBg : state === 'deleted' ? C.deletedBg : C.liveBg;
  const Icon = state === 'back' ? Ghost : state === 'deleted' ? Trash2 : CircleDot;
  const label = state === 'back' ? 'voltou · geração g1' : state === 'deleted' ? 'apagado · exclusão confirmada' : 'vivo · geração g1';

  return (
    <Paper>
      <div style={{ position: 'absolute', left: 160, top: 300, width: 820 }}>
        <Eyebrow delay={0}>o bug do registro que ressuscita</Eyebrow>
        <div style={{ height: 30 }} />
        <Headline delay={44} size={124}>
          Você apagou.
        </Headline>
        <Headline delay={100} size={124} color={C.reappeared}>
          Ele voltou.
        </Headline>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 1060,
          top: 360,
          width: 700,
          padding: '40px 44px',
          borderRadius: 24,
          background: C.panel,
          border: `3px solid ${tone}55`,
          boxShadow: `inset 8px 0 0 ${tone}, 0 30px 60px rgba(27,26,23,0.12)${back > 0 ? `, 0 0 0 ${18 * (1 - back) + 4}px ${C.reappeared}22` : ''}`,
          opacity: enter * (state === 'deleted' ? 0.75 : 1),
          transform: `translateY(${(1 - enter) * 40}px) translateX(${shake}px) scale(${1 + back * 0.04 - back * 0.04 * ease(frame, [108, 130], [0, 1])})`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 26, color: C.ink3 }}>
          <span>REGISTRO</span>
          <span>item-17</span>
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: 58,
            fontWeight: 600,
            textDecoration: state === 'deleted' ? 'line-through' : 'none',
            color: state === 'deleted' ? C.deleted : C.ink,
          }}
        >
          Lista de compras
        </div>
        <div
          style={{
            marginTop: 22,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 20px',
            borderRadius: 999,
            fontSize: 28,
            fontWeight: 600,
            color: tone,
            background: toneBg,
          }}
        >
          <Icon size={30} strokeWidth={2.2} />
          {label}
        </div>
      </div>
    </Paper>
  );
}
