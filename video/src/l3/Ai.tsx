import { ArrowRight, CircleCheck, CircleX, FileText, ShieldCheck, Sparkles } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { C, MONO } from '../theme';
import { Body, Eyebrow, Headline, Paper, useEnter } from '../ui';

export const AI_FRAMES = 360;

type Icon = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;

/**
 * O mecanismo do resumo com IA (não um resumo inventado): o relatório vai como dado,
 * o modelo devolve texto com etapas citadas e uma conferência em código aceita ou descarta.
 */
export function Ai() {
  return (
    <Paper>
      <div style={{ position: 'absolute', left: 160, top: 90 }}>
        <Eyebrow>resumo com IA · opcional</Eyebrow>
        <div style={{ height: 18 }} />
        <Headline size={64}>A IA explica. Não decide.</Headline>
      </div>

      <div style={{ position: 'absolute', left: 160, top: 290, display: 'flex', alignItems: 'stretch', gap: 26 }}>
        <Box delay={20} icon={FileText} title="Relatório da execução" width={420}>
          sanitizado, enviado como <b>dado</b>: o que vem do alvo não vira instrução
        </Box>
        <Arrow delay={34} />
        <Box delay={44} icon={Sparkles} title="Claude" width={380}>
          saída estruturada: cada frase traz as etapas que a sustentam
        </Box>
        <Arrow delay={58} />
        <Box delay={100} icon={ShieldCheck} title="Conferência em código" width={600}>
          <Check delay={112}>repete o veredito do avaliador</Check>
          <Check delay={132}>toda citação aponta para uma etapa que existe</Check>
          <Check delay={152}>cita a leitura em que a violação apareceu</Check>
        </Box>
      </div>

      <div style={{ position: 'absolute', left: 160, top: 690, display: 'flex', gap: 30 }}>
        <Outcome delay={176} ok title="Passou">
          aparece rotulado como IA, com botões <Cite /> que levam à evidência
        </Outcome>
        <Outcome delay={226} title="Contradisse o veredito?">
          descartado, com o motivo. O veredito nunca muda.
        </Outcome>
      </div>

      <div style={{ position: 'absolute', left: 160, top: 930 }}>
        <Body delay={262} size={26} style={{ color: C.ink3 }}>
          Sem chave da API da Anthropic, o recurso fica desligado e o resto funciona igual.
        </Body>
      </div>
    </Paper>
  );
}

function Box({ delay, icon: I, title, width, children }: { delay: number; icon: Icon; title: string; width: number; children: ReactNode }) {
  const p = useEnter(delay);
  return (
    <div
      style={{
        width,
        padding: '28px 30px',
        borderRadius: 20,
        background: C.panel,
        border: `2px solid ${C.rule}`,
        boxShadow: '0 20px 46px rgba(27,26,23,0.10)',
        opacity: p,
        transform: `translateY(${(1 - p) * 26}px)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 34, fontWeight: 600 }}>
        <I size={36} strokeWidth={2} color={C.ink2} /> {title}
      </div>
      <div style={{ marginTop: 14, fontSize: 26, lineHeight: 1.42, color: C.ink2 }}>{children}</div>
    </div>
  );
}

function Arrow({ delay }: { delay: number }) {
  const p = useEnter(delay);
  return (
    <div style={{ alignSelf: 'center', opacity: p, transform: `translateX(${(1 - p) * -14}px)` }}>
      <ArrowRight size={44} strokeWidth={2.2} color={C.ink3} />
    </div>
  );
}

function Check({ delay, children }: { delay: number; children: ReactNode }) {
  const p = useEnter(delay);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, opacity: p, transform: `translateX(${(1 - p) * 16}px)` }}>
      <CircleCheck size={28} strokeWidth={2.2} color={C.live} />
      <span>{children}</span>
    </div>
  );
}

function Outcome({ delay, ok = false, title, children }: { delay: number; ok?: boolean; title: string; children: ReactNode }) {
  const p = useEnter(delay);
  const tone = ok ? C.live : C.reappeared;
  const bg = ok ? C.liveBg : C.reappearedBg;
  const I = ok ? CircleCheck : CircleX;
  return (
    <div
      style={{
        width: 770,
        padding: '26px 30px',
        borderRadius: 20,
        background: bg,
        border: `2px solid ${tone}44`,
        boxShadow: `inset 8px 0 0 ${tone}`,
        opacity: p,
        transform: `translateY(${(1 - p) * 24}px)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 32, fontWeight: 600, color: tone }}>
        <I size={32} strokeWidth={2.2} /> {title}
      </div>
      <div style={{ marginTop: 10, fontSize: 27, lineHeight: 1.42, color: C.ink2 }}>{children}</div>
    </div>
  );
}

function Cite() {
  return (
    <span style={{ fontFamily: MONO, fontSize: 22, padding: '2px 12px', borderRadius: 999, border: `1.5px solid ${C.ruleStrong}`, background: C.paper, color: C.ink2 }}>
      etapa N
    </span>
  );
}
