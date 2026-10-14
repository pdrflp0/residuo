import { CircleDot, Ghost, Laptop, Mail, Server, Smartphone, Trash2, Wifi, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { C, MONO } from '../theme';
import { ease, Eyebrow, Paper } from '../ui';

export const STORY_FRAMES = 480;

const PHASES = [
  { at: 0, n: 1, text: 'A nota é criada no servidor.' },
  { at: 80, n: 2, text: 'No celular offline, alguém edita. O envio fica retido.' },
  { at: 175, n: 3, text: 'No notebook, a nota é apagada — e o servidor confirma.' },
  { at: 285, n: 4, text: 'O celular reconecta e envia a edição antiga.' },
  { at: 375, n: 5, text: '"Não existe? Então cria." O upsert recria a nota apagada.' },
];

/** Como o bug acontece, com o exemplo do app de notas offline. */
export function Story() {
  const frame = useCurrentFrame();
  const phase = [...PHASES].reverse().find((p) => frame >= p.at)!;
  const phaseIn = ease(frame, [phase.at, phase.at + 12], [0, 1]);

  const cardIn = ease(frame, [8, 26], [0, 1]);
  const envelopeIn = ease(frame, [95, 110], [0, 1]);
  const deleteArrow = ease(frame, [190, 215], [0, 1]);
  const deleted = ease(frame, [212, 222], [0, 1]);
  const confirmed = ease(frame, [232, 244], [0, 1]);
  const online = frame >= 290;
  const travel = ease(frame, [300, 350], [0, 1]);
  const upsertTag = ease(frame, [345, 360], [0, 1]);
  const back = ease(frame, [380, 392], [0, 1]);

  const cardTone = back > 0.5 ? C.reappeared : deleted > 0.5 ? C.deleted : C.live;
  const cardToneBg = back > 0.5 ? C.reappearedBg : deleted > 0.5 ? C.deletedBg : C.liveBg;
  const CardIcon = back > 0.5 ? Ghost : deleted > 0.5 ? Trash2 : CircleDot;

  // posições das colunas
  const phoneX = 150;
  const serverX = 700;
  const laptopX = 1290;
  const colW = 480;
  const envStart = { x: phoneX + 120, y: 520 };
  const envEnd = { x: serverX + 250, y: 190 }; // pousa no cabeçalho do servidor, sem cobrir o cartão

  return (
    <Paper>
      <div style={{ position: 'absolute', left: 150, top: 80 }}>
        <Eyebrow>como acontece</Eyebrow>
      </div>

      <Device x={phoneX} w={colW} title="Celular" sub={online ? 'online de novo' : 'sem internet'} icon={<Smartphone size={34} />}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, color: online ? C.live : C.conflict, fontWeight: 600 }}>
          {online ? <Wifi size={30} /> : <WifiOff size={30} />}
          {online ? 'conectado' : 'offline'}
        </div>
      </Device>

      <Device x={serverX} w={colW} title="Servidor" sub="banco de dados" icon={<Server size={34} />} strong>
        <div
          style={{
            opacity: cardIn * (deleted > 0.5 && back < 0.5 ? 0.7 : 1),
            transform: `scale(${0.9 + cardIn * 0.1 + (back > 0 && back < 1 ? 0.05 : 0)})`,
            padding: '26px 28px',
            borderRadius: 18,
            background: C.panel,
            border: `3px solid ${cardTone}55`,
            boxShadow: `inset 7px 0 0 ${cardTone}${back > 0.5 ? `, 0 0 0 ${8 + Math.sin(frame / 4) * 5}px ${C.reappeared}22` : ''}`,
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 20, color: C.ink3 }}>nota · g1</div>
          <div style={{ fontSize: 36, fontWeight: 600, marginTop: 8, textDecoration: deleted > 0.5 && back < 0.5 ? 'line-through' : 'none' }}>Lista de compras</div>
          <div
            style={{
              marginTop: 14,
              display: 'inline-flex',
              gap: 10,
              alignItems: 'center',
              fontSize: 22,
              fontWeight: 600,
              color: cardTone,
              background: cardToneBg,
              padding: '6px 14px',
              borderRadius: 999,
            }}
          >
            <CardIcon size={24} />
            {back > 0.5 ? 'voltou!' : deleted > 0.5 ? 'apagada' : 'viva'}
          </div>
        </div>
        <div
          style={{
            marginTop: 18,
            opacity: confirmed * (back > 0.5 ? 0.45 : 1),
            fontSize: 24,
            fontWeight: 600,
            color: C.deleted,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          ✓ exclusão confirmada
        </div>
        <div
          style={{
            marginTop: 14,
            opacity: upsertTag,
            fontFamily: MONO,
            fontSize: 22,
            color: C.reappeared,
            background: C.reappearedBg,
            padding: '8px 14px',
            borderRadius: 10,
            display: 'inline-block',
          }}
        >
          upsert: não existe? → cria
        </div>
      </Device>

      <Device x={laptopX} w={colW} title="Notebook" sub="outro aparelho" icon={<Laptop size={34} />}>
        <div
          style={{
            opacity: ease(frame, [178, 190], [0, 1]),
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 20px',
            borderRadius: 12,
            background: C.ink,
            color: C.paper,
            fontSize: 26,
            fontWeight: 600,
            transform: `scale(${frame > 186 && frame < 194 ? 0.94 : 1})`,
          }}
        >
          <Trash2 size={26} /> Apagar nota
        </div>
      </Device>

      {/* seta do notebook para o servidor */}
      <div
        style={{
          position: 'absolute',
          left: laptopX - 120,
          top: 395,
          width: 200 * deleteArrow,
          height: 4,
          background: C.deleted,
          opacity: deleteArrow > 0 && deleted < 1 ? 1 : 0,
          transformOrigin: 'right',
          marginLeft: 200 * (1 - deleteArrow),
        }}
      />

      {/* envelope da edição antiga */}
      <div
        style={{
          position: 'absolute',
          left: envStart.x + (envEnd.x - envStart.x) * travel,
          top: envStart.y + (envEnd.y - envStart.y) * travel - Math.sin(travel * Math.PI) * 120,
          opacity: envelopeIn * (frame > 365 ? ease(frame, [365, 378], [1, 0]) : 1),
          transform: `scale(${0.8 + envelopeIn * 0.2})`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 20px',
          borderRadius: 14,
          background: C.panel,
          border: `2.5px solid ${C.conflict}66`,
          boxShadow: '0 14px 30px rgba(27,26,23,0.15)',
          zIndex: 5,
        }}
      >
        <Mail size={32} color={C.conflict} />
        <div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>edição antiga</div>
          <div style={{ fontFamily: MONO, fontSize: 18, color: C.ink3 }}>{travel > 0 ? 'enviando…' : 'retida · base r1'}</div>
        </div>
      </div>

      {/* legenda */}
      <div
        style={{
          position: 'absolute',
          left: 150,
          right: 150,
          bottom: 90,
          display: 'flex',
          alignItems: 'center',
          gap: 26,
          padding: '26px 34px',
          borderRadius: 20,
          background: C.panel,
          border: `1.5px solid ${C.rule}`,
          boxShadow: '0 10px 30px rgba(27,26,23,0.06)',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: phase.n === 5 ? C.reappeared : C.ink,
            color: C.paper,
            display: 'grid',
            placeItems: 'center',
            fontSize: 34,
            fontWeight: 700,
            flex: 'none',
          }}
        >
          {phase.n}
        </div>
        <div style={{ fontSize: 40, fontWeight: 500, opacity: phaseIn, transform: `translateX(${(1 - phaseIn) * 20}px)` }}>{phase.text}</div>
      </div>
    </Paper>
  );
}

function Device({ x, w, title, sub, icon, children, strong }: { x: number; w: number; title: string; sub: string; icon: ReactNode; children?: ReactNode; strong?: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 170,
        width: w,
        height: 560,
        borderRadius: 24,
        background: strong ? `${C.panel}` : `${C.panel}aa`,
        border: `2px ${strong ? 'solid' : 'dashed'} ${C.ruleStrong}`,
        padding: 34,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 30 }}>
        <div style={{ width: 60, height: 60, borderRadius: 14, display: 'grid', placeItems: 'center', background: C.paper, border: `1.5px solid ${C.rule}`, color: C.ink2 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 34, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 22, color: C.ink3 }}>{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
}
