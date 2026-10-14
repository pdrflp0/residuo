import { Img, staticFile, useCurrentFrame } from 'remotion';
import geometry from '../../public/shots/geometry.json';
import { C } from '../theme';
import { BrowserFrame, ease, Eyebrow, Highlight, Paper } from '../ui';

export const EVIDENCE_FRAMES = 240;

const FX = 610;
const FY = 170;
const FW = 1250;
const S = FW / geometry.evidence9.violation.cw;
const FH = 690;

const PHASES = [
  { at: 0, title: 'Cada etapa guarda a troca HTTP real.', body: 'Requisição, resposta e os fatos extraídos dela.' },
  { at: 80, title: 'De onde veio?', body: 'O próprio serviço informa quem escreveu por último: a entrega liberada na etapa 8.' },
  { at: 150, title: 'Etapa 8, a causa.', body: 'O consumidor respondeu UPSERT_INSERTED: recriou a linha apagada.', color: C.reappeared },
];

/** Evidência: a leitura da etapa 9 e a escrita da etapa 8, com destaques. */
export function Evidence() {
  const frame = useCurrentFrame();
  const phase = [...PHASES].reverse().find((p) => frame >= p.at)!;
  const textIn = ease(frame, [phase.at, phase.at + 12], [0, 1]);
  const show8 = ease(frame, [145, 160], [0, 1]);
  const scroll9 = ease(frame, [80, 110], [0, 1]) * 110;
  const g9 = geometry.evidence9;
  const g8 = geometry.evidence8;

  return (
    <Paper>
      <div style={{ position: 'absolute', left: 90, top: 220, width: 470 }}>
        <Eyebrow>evidência, não opinião</Eyebrow>
        <div style={{ height: 30 }} />
        <div style={{ opacity: textIn, transform: `translateY(${(1 - textIn) * 16}px)` }}>
          <div style={{ fontSize: 50, fontWeight: 600, lineHeight: 1.12, letterSpacing: '-0.02em', color: phase.color ?? C.ink }}>{phase.title}</div>
          <div style={{ fontSize: 32, lineHeight: 1.4, color: C.ink2, marginTop: 18 }}>{phase.body}</div>
        </div>
      </div>

      <BrowserFrame x={FX} y={FY} width={FW} height={FH} url={`localhost:5173/#/runs/${geometry.runId}`}>
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - show8, transform: `translateY(${-scroll9}px)` }}>
          <Img src={staticFile('shots/evidence-9.png')} style={{ position: 'absolute', width: FW }} />
          <Highlight
            x={g9.violation.x * S}
            y={g9.violation.y * S}
            w={g9.violation.w * S}
            h={g9.violation.h * S}
            color={C.reappeared}
            opacity={ease(frame, [15, 28], [0, 1]) * ease(frame, [75, 85], [1, 0])}
          />
          <Highlight
            x={g9.facts.x * S}
            y={g9.facts.y * S}
            w={g9.facts.w * S * 0.5}
            h={g9.facts.h * S}
            color={C.ink}
            label="lastWrittenBy → entrega da etapa 8"
            labelSide="right"
            opacity={ease(frame, [90, 102], [0, 1])}
          />
        </div>
        <div style={{ position: 'absolute', inset: 0, opacity: show8, transform: `translateY(${-ease(frame, [160, 200], [0, 210])}px)` }}>
          <Img src={staticFile('shots/evidence-8.png')} style={{ position: 'absolute', width: FW }} />
          <Highlight
            x={g8.response.x * S}
            y={g8.response.y * S}
            w={g8.response.w * S}
            h={g8.response.h * S}
            color={C.reappeared}
            label="HTTP 200 · UPSERT_INSERTED"
            opacity={ease(frame, [185, 198], [0, 1])}
          />
        </div>
      </BrowserFrame>
    </Paper>
  );
}
