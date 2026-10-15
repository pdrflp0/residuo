import { ShieldCheck } from 'lucide-react';
import { Img, staticFile } from 'remotion';
import geometry from '../../public/shots/l3/geometry.json';
import { C, MONO } from '../theme';
import { Chip, Eyebrow, Headline, Paper, useEnter } from '../ui';

export const FIX_FRAMES = 300;

const W = 1560;
const bf = geometry.backup.guardedFacts;
const df = geometry.derived.guardedFacts;
const seen = (v: boolean | null) => (v === false ? 'ausente' : v === true ? 'g1 visível' : '—');

/** A mesma sequência no modo protegido. Comparações reais e fatos das execuções protegidas. */
export function Fix() {
  return (
    <Paper>
      <div style={{ position: 'absolute', left: 180, top: 92 }}>
        <Eyebrow>modo protegido</Eyebrow>
        <div style={{ height: 18 }} />
        <Headline size={64}>A mesma sequência, corrigida.</Headline>
      </div>
      <Row
        top={280}
        delay={10}
        title="Backup restaurado"
        how="reaplica o registro de exclusões logo após o restore"
        src="backup-compare-head.png"
        facts={[
          `etapa ${bf['restore-snapshot'].seq} · ${bf['restore-snapshot'].writeOutcome} · ${bf['restore-snapshot'].reappliedDeletions} exclusão reaplicada`,
          `leitura final: ${seen(bf['inspect-after'].visible)}`,
        ]}
      />
      <Row
        top={640}
        delay={140}
        title="Cache e busca"
        how="invalida cache e índice na mesma transação da exclusão"
        src="derived-compare-head.png"
        facts={[`cache: ${seen(df['inspect-cache'].visible)}`, `busca: ${seen(df['inspect-search'].visible)}`]}
      />
    </Paper>
  );
}

function Row({ top, delay, title, how, src, facts }: { top: number; delay: number; title: string; how: string; src: string; facts: string[] }) {
  const p = useEnter(delay);
  const chips = useEnter(delay + 34);
  return (
    <div style={{ position: 'absolute', left: 180, top, width: W, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginBottom: 14 }}>
        <div style={{ fontSize: 34, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 26, color: C.ink3 }}>a correção {how}</div>
      </div>
      <Img src={staticFile(`shots/l3/${src}`)} style={{ width: W, borderRadius: 12, boxShadow: '0 20px 50px rgba(27,26,23,0.10)' }} />
      <div style={{ display: 'flex', gap: 14, marginTop: 16, opacity: chips, transform: `translateY(${(1 - chips) * 12}px)` }}>
        {facts.map((f) => (
          <Chip key={f} color={C.live} bg={C.liveBg} style={{ fontFamily: MONO, fontSize: 24 }}>
            <ShieldCheck size={24} /> {f}
          </Chip>
        ))}
      </div>
    </div>
  );
}
