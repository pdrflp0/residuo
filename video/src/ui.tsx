import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, MONO, SANS } from './theme';

/** 0 → 1 com mola a partir de `delay` quadros. */
export function useEnter(delay = 0, damping = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.7 } });
}

/** Interpola de forma suave entre quadros. */
export function ease(frame: number, input: [number, number], output: [number, number]) {
  return interpolate(frame, input, output, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 0.7, 0.2, 1) });
}

export function Paper({ children }: { children?: ReactNode }) {
  const frame = useCurrentFrame();
  const grid = 'rgba(27,26,23,0.05)';
  return (
    <AbsoluteFill
      style={{
        background: C.paper,
        backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
        backgroundPosition: `${-frame * 0.25}px ${-frame * 0.25}px`,
        fontFamily: SANS,
        color: C.ink,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

export function Eyebrow({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: CSSProperties }) {
  const p = useEnter(delay);
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 22,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: C.ink3,
        opacity: p,
        transform: `translateY(${(1 - p) * 14}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Headline({ children, delay = 0, size = 72, color = C.ink, style }: { children: ReactNode; delay?: number; size?: number; color?: string; style?: CSSProperties }) {
  const p = useEnter(delay);
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 600,
        lineHeight: 1.1,
        letterSpacing: '-0.02em',
        color,
        opacity: p,
        transform: `translateY(${(1 - p) * 24}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Body({ children, delay = 0, size = 34, style }: { children: ReactNode; delay?: number; size?: number; style?: CSSProperties }) {
  const p = useEnter(delay);
  return (
    <div style={{ fontSize: size, lineHeight: 1.4, color: C.ink2, opacity: p, transform: `translateY(${(1 - p) * 16}px)`, ...style }}>{children}</div>
  );
}

export function Chip({ children, color = C.ink2, bg = C.paper2, style }: { children: ReactNode; color?: string; bg?: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 18px',
        borderRadius: 999,
        fontSize: 26,
        fontWeight: 500,
        color,
        background: bg,
        border: `1.5px solid ${color}33`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Logo({ size = 96, spin = true }: { size?: number; spin?: boolean }) {
  const frame = useCurrentFrame();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill={C.ink} />
      <circle
        cx="16"
        cy="16"
        r="8.5"
        fill="none"
        stroke={C.paper}
        strokeWidth="2.4"
        strokeDasharray="3.2 3.2"
        transform={spin ? `rotate(${frame * 1.2} 16 16)` : undefined}
      />
      <circle cx="16" cy="16" r={3.4 + Math.sin(frame / 8) * 0.35} fill={C.brandDot} />
    </svg>
  );
}

/** Janela de navegador com uma captura real dentro. */
export function BrowserFrame({
  x,
  y,
  width,
  height,
  url,
  children,
  style,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height: height + 44,
        borderRadius: 16,
        overflow: 'hidden',
        background: C.panel,
        border: `1.5px solid ${C.ruleStrong}`,
        boxShadow: '0 2px 0 rgba(27,26,23,0.04), 0 30px 70px rgba(27,26,23,0.16)',
        ...style,
      }}
    >
      <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 9, padding: '0 18px', background: C.paper2, borderBottom: `1.5px solid ${C.rule}` }}>
        {['#e0533f', '#e7b13c', '#3fae6a'].map((c) => (
          <span key={c} style={{ width: 13, height: 13, borderRadius: 999, background: c, opacity: 0.85 }} />
        ))}
        <span
          style={{
            marginLeft: 18,
            fontFamily: MONO,
            fontSize: 17,
            color: C.ink3,
            background: C.panel,
            border: `1px solid ${C.rule}`,
            borderRadius: 8,
            padding: '4px 14px',
          }}
        >
          {url}
        </span>
      </div>
      <div style={{ position: 'relative', width, height, overflow: 'hidden', background: C.paper }}>{children}</div>
    </div>
  );
}

export function Shot({ src, width, style }: { src: string; width: number; style?: CSSProperties }) {
  return <Img src={staticFile(`shots/${src}`)} style={{ position: 'absolute', left: 0, top: 0, width, ...style }} />;
}

/** Ponteiro do mouse com "clique" (escala) no quadro `clickAt`. */
export function Cursor({ x, y, clickAt }: { x: number; y: number; clickAt?: number }) {
  const frame = useCurrentFrame();
  const press = clickAt === undefined ? 0 : interpolate(frame, [clickAt - 3, clickAt, clickAt + 6], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ripple = clickAt === undefined ? 0 : interpolate(frame, [clickAt, clickAt + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none', zIndex: 20 }}>
      {clickAt !== undefined && frame >= clickAt && (
        <div
          style={{
            position: 'absolute',
            left: -40 * ripple,
            top: -40 * ripple,
            width: 80 * ripple,
            height: 80 * ripple,
            borderRadius: 999,
            border: `3px solid ${C.ink}`,
            opacity: 1 - ripple,
          }}
        />
      )}
      <svg width="40" height="40" viewBox="0 0 24 24" style={{ transform: `scale(${1 - press * 0.18})`, transformOrigin: '0 0', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.25))' }}>
        <path d="M4 2 L4 19 L8.5 14.8 L11.6 21.5 L14.4 20.3 L11.4 13.7 L17.6 13.5 Z" fill={C.ink} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Moldura de destaque que aponta para uma região de uma captura. */
export function Highlight({
  x,
  y,
  w,
  h,
  color = C.ink,
  label,
  labelSide = 'top',
  opacity = 1,
  pulse = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  label?: ReactNode;
  labelSide?: 'top' | 'bottom' | 'left' | 'right';
  opacity?: number;
  pulse?: boolean;
}) {
  const frame = useCurrentFrame();
  const glow = pulse ? 8 + Math.sin(frame / 5) * 6 : 0;
  return (
    <div style={{ position: 'absolute', left: x - 8, top: y - 8, width: w + 16, height: h + 16, opacity, zIndex: 10 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 14,
          border: `4px solid ${color}`,
          boxShadow: pulse ? `0 0 0 ${glow}px ${color}22` : 'none',
        }}
      />
      {label && (
        <div
          style={{
            position: 'absolute',
            ...(labelSide === 'top'
              ? { bottom: '100%', marginBottom: 10, right: 0 }
              : labelSide === 'bottom'
                ? { top: '100%', marginTop: 10, right: 0 }
                : labelSide === 'right'
                  ? { left: '100%', marginLeft: 14, top: '50%', transform: 'translateY(-50%)' }
                  : { right: '100%', marginRight: 14, top: 0 }),
            background: color,
            color: '#fff',
            fontSize: 24,
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: 10,
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
