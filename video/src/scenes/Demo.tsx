import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import geometry from '../../public/shots/geometry.json';
import { C, MONO } from '../theme';
import { BrowserFrame, Cursor, ease, Eyebrow, Highlight, Paper, Shot } from '../ui';

export const DEMO_FRAMES = 570;

const HOME_END = 80;
const STEP_FRAMES = 46;
const STEPS_END = HOME_END + 9 * STEP_FRAMES; // 494

// janela do navegador (px do vídeo)
const FX = 610;
const FY = 150;
const FW = 1250;
type StepGeo = { w: number; h: number; node: { x: number; y: number; w: number; h: number }; watched: { x: number; y: number; w: number; h: number } | null };
const STEPS = geometry.steps as unknown as Record<string, StepGeo>;
const geo = (k: number) => STEPS[String(k)]!;
const S = FW / geo(9).w; // px do vídeo por px CSS da captura
const FH = Math.round(geo(9).h * S);

const TEXT: Record<number, { title: string; body: string; color?: string }> = {
  0: { title: 'Um clique.', body: 'A demonstração roda o cenário contra o serviço real, no modo com o bug.' },
  1: { title: 'Cria o registro.', body: 'item-17, geração g1, revisão 1.' },
  2: { title: 'Prepara uma edição offline…', body: 'feita a partir da revisão 1.' },
  3: { title: '…e o envio fica retido.', body: 'Como um celular sem internet.' },
  4: { title: 'Lê o estado inicial.', body: 'O observador vê g1 viva.' },
  5: { title: 'Apaga o registro.', body: 'Outro cliente pede a exclusão.' },
  6: { title: 'Exclusão confirmada.', body: 'A partir daqui começa a zona vigiada.' },
  7: { title: 'Lê de novo: ausente.', body: 'Até aqui, tudo certo.' },
  8: { title: 'Libera a edição antiga.', body: 'O serviço relata: upsert inseriu o registro.', color: C.conflict },
  9: { title: 'E a leitura vê g1 de novo.', body: 'A geração apagada voltou.', color: C.reappeared },
};

/** Demo com capturas reais do app, etapa por etapa. */
export function Demo() {
  const frame = useCurrentFrame();
  const step = frame < HOME_END ? 0 : Math.min(9, Math.floor((frame - HOME_END) / STEP_FRAMES) + 1);
  const stepStart = step === 0 ? 0 : HOME_END + (step - 1) * STEP_FRAMES;
  const textIn = ease(frame, [stepStart, stepStart + 10], [0, 1]);
  const t = TEXT[step]!;

  // zoom suave nas etapas 8 e 9
  const zoom = ease(frame, [HOME_END + 7 * STEP_FRAMES, HOME_END + 7 * STEP_FRAMES + 25], [1, 1.22]);
  const unzoom = ease(frame, [STEPS_END, STEPS_END + 18], [0, 1]);
  const z = zoom - (zoom - 1) * unzoom;
  // ancorado na borda direita: a etapa 9 nunca sai do quadro
  const origin = `${FW}px ${Math.round(FH * 0.82)}px`;

  // anel que acompanha a etapa atual (posição medida na captura daquela etapa)
  const node = step > 0 ? geo(step).node : undefined;
  const prevNode = step > 1 ? geo(step - 1).node : node;
  const watched = step > 0 ? geo(step).watched : null;
  const move = ease(frame, [stepStart, stepStart + 12], [0, 1]);
  const ring = node && prevNode ? { x: prevNode.x + (node.x - prevNode.x) * move, y: prevNode.y + (node.y - prevNode.y) * move, w: node.w, h: node.h } : undefined;

  const verdictIn = ease(frame, [STEPS_END + 6, STEPS_END + 26], [0, 1]);
  const homeScale = FW / 1440;
  const btn = geometry.homeDemoButton;

  return (
    <Paper>
      {/* coluna de texto */}
      <div style={{ position: 'absolute', left: 90, top: 200, width: 470 }}>
        <Eyebrow>demo real · app rodando</Eyebrow>
        <div style={{ height: 30 }} />
        {step > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 26, color: C.ink3, marginBottom: 14 }}>
            etapa {String(step).padStart(2, '0')} / 09
          </div>
        )}
        <div style={{ opacity: textIn, transform: `translateY(${(1 - textIn) * 16}px)` }}>
          <div style={{ fontSize: 52, fontWeight: 600, lineHeight: 1.12, letterSpacing: '-0.02em', color: t.color ?? C.ink }}>{t.title}</div>
          <div style={{ fontSize: 32, lineHeight: 1.4, color: C.ink2, marginTop: 18 }}>{t.body}</div>
        </div>
        {step > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 44 }}>
            {Array.from({ length: 9 }, (_, i) => (
              <div
                key={i}
                style={{
                  width: 38,
                  height: 8,
                  borderRadius: 4,
                  background: i < step ? (i >= 7 ? C.reappeared : i >= 5 ? C.deleted : C.ink) : C.rule,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <BrowserFrame x={FX} y={FY} width={FW} height={FH} url={step === 0 ? 'localhost:5173/' : `localhost:5173/#/runs/${geometry.runId}`}>
        {step === 0 ? (
          <>
            <Shot src="home.png" width={FW} />
            <Cursor
              x={interpolate(frame, [0, 45], [FW * 0.75, (btn.x + btn.w * 0.6) * homeScale], { extrapolateRight: 'clamp' })}
              y={interpolate(frame, [0, 45], [FH * 0.85, (btn.y + btn.h * 0.55) * homeScale], { extrapolateRight: 'clamp' })}
              clickAt={55}
            />
          </>
        ) : (
          <div style={{ position: 'absolute', inset: 0, transform: `scale(${z})`, transformOrigin: origin }}>
            {Array.from({ length: 9 }, (_, i) => i + 1).map((k) => (
              <Img
                key={k}
                src={staticFile(`shots/bench-${k}.png`)}
                style={{ position: 'absolute', left: 0, top: 0, width: FW, opacity: k === step ? 1 : 0 }}
              />
            ))}
            {ring && (
              <Highlight
                x={ring.x * S}
                y={ring.y * S}
                w={ring.w * S}
                h={ring.h * S}
                color={step >= 8 ? C.reappeared : step >= 5 ? C.deleted : C.ink}
                pulse={step === 9}
              />
            )}
            {watched && (
              <Highlight
                x={watched.x * S}
                y={watched.y * S}
                w={watched.w * S}
                h={watched.h * S}
                color={C.reappeared}
                opacity={ease(frame, [HOME_END + 5 * STEP_FRAMES, HOME_END + 5 * STEP_FRAMES + 12], [0, 0.55]) * (step >= 8 ? 0.4 : 1)}
                label={step === 6 || step === 7 ? 'zona vigiada' : undefined}
                labelSide="bottom"
              />
            )}
          </div>
        )}
      </BrowserFrame>

      {/* veredito real sobe por cima */}
      {verdictIn > 0 && (
        <div
          style={{
            position: 'absolute',
            left: FX - 20,
            top: FY + FH - 300 + (1 - verdictIn) * 80,
            width: FW + 40,
            opacity: verdictIn,
            filter: 'drop-shadow(0 30px 50px rgba(27,26,23,0.25))',
          }}
        >
          <Img src={staticFile('shots/verdict-vulnerable.png')} style={{ width: FW + 40, borderRadius: 14 }} />
        </div>
      )}
    </Paper>
  );
}
