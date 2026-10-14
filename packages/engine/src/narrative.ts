/**
 * Frases em linguagem simples derivadas SOMENTE dos fatos gravados.
 * Se o fato não existe, a frase não afirma nada sobre ele.
 */
import type { StepObservation, Verdict } from '@residuo/contracts';

export type Tone = 'live' | 'deleted' | 'conflict' | 'reappeared' | 'new' | 'restored' | 'neutral' | 'failure' | 'skipped';

export interface StepNarrative {
  tone: Tone;
  headline: string;
}

const g = (n?: number) => (n === undefined ? 'g?' : `g${n}`);

const CONSUMER_OUTCOMES: Record<string, { tone: Tone; text: (o: StepObservation) => string }> = {
  UPSERT_INSERTED: {
    tone: 'neutral',
    text: (o) => `O alvo relata que o consumidor aplicou a edição por upsert e INSERIU o registro de novo (${g(o.facts.generation)}, revisão ${o.facts.revision ?? '?'}).`,
  },
  UPSERT_UPDATED: { tone: 'live', text: (o) => `O consumidor aplicou a edição por upsert (revisão ${o.facts.revision ?? '?'}).` },
  APPLIED: { tone: 'live', text: (o) => `Edição aplicada sobre a revisão ${o.facts.baseRevision ?? '?'} (nova revisão ${o.facts.revision ?? '?'}).` },
  REJECTED_DELETED: {
    tone: 'conflict',
    text: (o) => `Edição rejeitada: a geração ${g(o.facts.generation)} tem marcador de exclusão. Resultado explícito, nada foi escrito.`,
  },
  REJECTED_STALE_REVISION: { tone: 'conflict', text: (o) => `Edição rejeitada: foi preparada sobre a revisão ${o.facts.baseRevision ?? '?'}, que já não é a atual.` },
  REJECTED_GENERATION_MISMATCH: { tone: 'conflict', text: () => 'Edição rejeitada: pertence a outra geração do registro.' },
  REJECTED_NOT_FOUND: { tone: 'conflict', text: () => 'Edição rejeitada: o registro não existe e atualizações não criam registros.' },
  DUPLICATE_IGNORED: { tone: 'conflict', text: () => 'Mensagem já processada antes: o inbox a ignorou explicitamente.' },
};

const isCause = (o: StepObservation, verdict?: Verdict) => verdict?.violations.some((v) => v.causedBySeq === o.seq) ?? false;

export function describeStep(o: StepObservation, verdict?: Verdict): StepNarrative {
  if (o.status === 'skipped') return { tone: 'skipped', headline: `Etapa não executada: ${o.error ?? 'execução interrompida'}.` };
  if (o.status !== 'ok') {
    const what = o.status === 'timeout' ? 'Sem resposta dentro do tempo limite' : o.status === 'unsupported' ? 'Capacidade não suportada pelo adapter' : 'Falha';
    return { tone: 'failure', headline: `${what}${o.error ? `: ${o.error}` : ''}.` };
  }
  const f = o.facts;
  switch (o.kind) {
    case 'create':
      if (!f.wrote) return { tone: 'conflict', headline: `Criação recusada pelo alvo (${f.writeOutcome ?? '?'}).` };
      return f.generation !== undefined && f.generation > 1
        ? { tone: 'new', headline: `Nova geração criada explicitamente: ${g(f.generation)}, revisão ${f.revision}.` }
        : { tone: 'live', headline: `Registro criado: ${g(f.generation)}, revisão ${f.revision}.` };
    case 'prepare-update':
      return { tone: 'neutral', headline: `Edição preparada a partir da revisão ${f.baseRevision} de ${g(f.generation)}.` };
    case 'hold':
      return { tone: 'neutral', headline: 'Entrega retida: o consumidor ainda não recebeu a edição.' };
    case 'release':
    case 'replay': {
      const known = f.writeOutcome ? CONSUMER_OUTCOMES[f.writeOutcome] : undefined;
      if (!known) {
        const wrote = f.wrote ? 'e relata que escreveu no registro' : 'sem escrever nada';
        return { tone: isCause(o, verdict) ? 'reappeared' : f.wrote ? 'neutral' : 'conflict', headline: `Entrega processada: o alvo respondeu "${f.writeOutcome ?? '?'}" ${wrote}.` };
      }
      // O tom de reaparecimento numa escrita só vem do veredito (leitura posterior que confirmou).
      return { tone: isCause(o, verdict) ? 'reappeared' : known.tone, headline: known.text(o) };
    }
    case 'delete':
      return f.wrote
        ? { tone: 'deleted', headline: `Exclusão aceita para ${g(f.generation)} (revisão ${f.revision}).` }
        : { tone: 'conflict', headline: `Exclusão recusada (${f.writeOutcome ?? '?'}).` };
    case 'confirm-deletion':
      return f.confirmed
        ? { tone: 'deleted', headline: `Exclusão em vigor${f.mechanism ? ` (mecanismo: ${f.mechanism})` : ''}.` }
        : { tone: 'failure', headline: `Confirmação não obtida: o alvo informa "${f.confirmationStatus ?? '?'}".` };
    case 'restore':
      if (f.wrote && isCause(o, verdict)) {
        return { tone: 'reappeared', headline: `Restaurado (${g(f.generation)}, revisão ${f.revision}), mas a política declarada não permite restauração.` };
      }
      return f.wrote
        ? { tone: 'restored', headline: `Restaurado por "${f.authorization?.actor ?? '?'}": ${g(f.generation)}, revisão ${f.revision}.` }
        : { tone: 'conflict', headline: `Restauração recusada (${f.writeOutcome ?? '?'}).` };
    case 'inspect': {
      if (!f.visible) return { tone: 'deleted', headline: 'Leitura: registro ausente.' };
      const isViolation = verdict?.violations.some((v) => v.observedAtSeq === o.seq || v.evidenceSeqs.includes(o.seq));
      if (isViolation) return { tone: 'reappeared', headline: `Leitura: a geração excluída ${g(f.observedGeneration)} está visível de novo.` };
      const allowance = verdict?.allowances.find((a) => a.observedAtSeq === o.seq);
      if (allowance?.kind === 'new-generation') return { tone: 'new', headline: `Leitura: visível a nova geração ${g(f.observedGeneration)}.` };
      if (allowance?.kind === 'authorized-restore') return { tone: 'restored', headline: `Leitura: ${g(f.observedGeneration)} visível por restauração autorizada.` };
      return { tone: 'live', headline: `Leitura: ${g(f.observedGeneration)} visível, revisão ${f.observedRevision}.` };
    }
  }
}
