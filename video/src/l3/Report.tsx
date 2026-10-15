import { FileCode2, ShieldCheck } from 'lucide-react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import geometry from '../../public/shots/l3/geometry.json';
import { C, MONO } from '../theme';
import { BrowserFrame, Chip, ease, Eyebrow, Headline, Body, Paper, useEnter } from '../ui';

export const REPORT_FRAMES = 270;

const W = 1260;
const H = 700;
// zoom na coluna de conteúdo do relatório (1200 px CSS dos 1440 capturados)
const IMG_W = (W * geometry.report.w) / 1200;
const S = IMG_W / geometry.report.w;
const LEFT = -((geometry.report.w - 1200) / 2) * S;

/** O relatório HTML exportado, aberto como arquivo. Captura real; zero requisições externas medidas na captura. */
export function Report() {
  const frame = useCurrentFrame();
  const scroll = ease(frame, [80, 200], [0, 450 * S]);
  const chips = useEnter(90);
  return (
    <Paper>
      <div style={{ position: 'absolute', left: 90, top: 230, width: 470 }}>
        <Eyebrow>relatório compartilhável</Eyebrow>
        <div style={{ height: 30 }} />
        <Headline size={56}>Um arquivo só.</Headline>
        <div style={{ height: 20 }} />
        <Body delay={14} size={31}>
          Linha do tempo clicável, evidência HTTP e veredito. Abre em qualquer navegador, sem servidor.
        </Body>
        <div style={{ height: 34 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start', opacity: chips, transform: `translateY(${(1 - chips) * 14}px)` }}>
          <Chip color={C.live} bg={C.liveBg} style={{ fontSize: 24 }}>
            <ShieldCheck size={24} /> {geometry.report.externalRequests} requisições externas
          </Chip>
          <Chip style={{ fontSize: 24 }}>
            <FileCode2 size={24} /> pronto para anexar numa issue
          </Chip>
        </div>
      </div>
      <BrowserFrame x={600} y={150} width={W} height={H} url={`file:///…/${geometry.report.file}`}>
        <Img src={staticFile('shots/l3/report.png')} style={{ position: 'absolute', left: LEFT, top: -scroll, width: IMG_W }} />
      </BrowserFrame>
      <div style={{ position: 'absolute', left: 600, top: 912, fontFamily: MONO, fontSize: 20, color: C.ink3 }}>
        interface → “Relatório HTML (compartilhável)” · CLI → residuo run --report &lt;pasta&gt;
      </div>
    </Paper>
  );
}
