import { useCurrentFrame } from 'remotion';
import geometry from '../../public/shots/l3/geometry.json';
import { C, MONO } from '../theme';
import { ease, Eyebrow, Headline, Paper } from '../ui';

export const EXPLORE_FRAMES = 300;

const CMD = geometry.explore.command;
const LINES: string[] = geometry.explore.output;
const ORDERS = LINES.filter((l) => /^\s+(VIOLATION|NO_VIOLATION_OBSERVED|INCONCLUSIVE)\b/.test(l)).length;
const VISIBLE = 18;
const LH = 35;

/** Quadro em que cada linha da saída REAL da CLI aparece. */
function lineAt(i: number): number {
  if (i < 2) return 40 + i * 4; // cabeçalho
  if (i < 2 + ORDERS) return 48 + ((i - 2) * 120) / ORDERS; // as ordens, rápido
  const rest = i - 2 - ORDERS;
  if (rest <= 1) return 176 + rest * 6; // resumo
  return 200 + (rest - 2) * 4; // menor sequência e etapas
}

function color(line: string): string {
  if (/^\s+VIOLATION\b/.test(line)) return '#f19a8e';
  if (/^\s+NO_VIOLATION_OBSERVED\b/.test(line)) return '#8fd1a6';
  if (line.startsWith('menor sequência')) return '#ffd38a';
  if (/ordens executadas/.test(line)) return C.paper;
  return '#c9c4b8';
}

/** A CLI explorando 60 ordens com 3 clientes: saída real, gravada na captura. */
export function Explore() {
  const frame = useCurrentFrame();
  const typed = Math.round(ease(frame, [4, 34], [0, CMD.length]));
  const shown = LINES.filter((_, i) => frame >= lineAt(i)).length;
  const first = Math.max(0, shown - VISIBLE);
  return (
    <Paper>
      <div style={{ position: 'absolute', left: 160, top: 90 }}>
        <Eyebrow>explorar ordens · mais clientes</Eyebrow>
        <div style={{ height: 18 }} />
        <Headline size={64}>3 clientes offline. {ORDERS} ordens.</Headline>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 160,
          top: 250,
          width: 1600,
          height: 44 + 30 + LH * (VISIBLE + 1) + 24,
          borderRadius: 16,
          overflow: 'hidden',
          background: '#1f1e1b',
          boxShadow: '0 30px 70px rgba(27,26,23,0.25)',
          fontFamily: MONO,
        }}
      >
        <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 9, padding: '0 18px', background: '#2c2a26' }}>
          {['#e0533f', '#e7b13c', '#3fae6a'].map((c) => (
            <span key={c} style={{ width: 13, height: 13, borderRadius: 999, background: c, opacity: 0.85 }} />
          ))}
          <span style={{ marginLeft: 16, fontSize: 18, color: '#9a958a' }}>terminal · ResiduoPP</span>
        </div>
        <div style={{ padding: '22px 30px', fontSize: 21, lineHeight: `${LH}px` }}>
          <div style={{ color: C.paper, whiteSpace: 'pre' }}>
            <span style={{ color: '#8fd1a6' }}>$ </span>
            {CMD.slice(0, typed)}
            {typed < CMD.length && frame % 16 < 8 && <span style={{ background: C.paper }}>&nbsp;</span>}
          </div>
          {LINES.slice(first, shown).map((l, k) => {
            const i = first + k;
            const minimal = l.startsWith('menor sequência');
            return (
              <div
                key={i}
                style={{
                  color: color(l),
                  whiteSpace: 'pre',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontWeight: minimal ? 600 : 400,
                  background: minimal ? 'rgba(255,211,138,0.12)' : 'transparent',
                  borderRadius: 6,
                }}
              >
                {l || ' '}
              </div>
            );
          })}
        </div>
      </div>
    </Paper>
  );
}
