/**
 * Estado dos cartões de entidade até a etapa revelada.
 * Deriva SÓ das observações gravadas e distingue o que o alvo relatou (escrita)
 * do que o observador viu (leitura).
 */
import type { StepObservation, Verdict } from '@residuo/contracts';
import type { Tone } from '@residuo/engine/narrative';

export interface CardState {
  tone?: Tone;
  state: string;
  sub: string;
  source?: 'relatado pelo alvo' | 'visto pelo observador';
  deleted?: boolean;
  changedAt?: number;
}

export interface EntityCards {
  record: CardState;
  edit: CardState;
  deletion: CardState;
}

export function deriveCards(steps: StepObservation[], revealed: number, verdict?: Verdict): EntityCards {
  const cards: EntityCards = {
    record: { state: 'ainda não existe', sub: 'nenhuma escrita até aqui' },
    edit: { state: 'nenhuma', sub: 'nenhum cliente preparou edição' },
    deletion: { state: 'nenhuma', sub: 'ninguém pediu exclusão' },
  };
  let deletedGen: number | undefined;
  let confirmed = false;

  for (const s of steps.slice(0, revealed)) {
    if (s.status !== 'ok') {
      if (s.kind === 'confirm-deletion') {
        cards.deletion = { tone: 'failure', state: 'sem confirmação', sub: s.error ?? s.status, changedAt: s.seq };
      }
      continue;
    }
    const f = s.facts;
    switch (s.kind) {
      case 'create':
        if (f.wrote) {
          const isNew = (f.generation ?? 1) > 1;
          cards.record = {
            tone: isNew ? 'new' : 'live',
            state: isNew ? `nova geração g${f.generation}` : 'vivo',
            sub: `g${f.generation} · revisão ${f.revision}`,
            source: 'relatado pelo alvo',
            changedAt: s.seq,
          };
        }
        break;
      case 'prepare-update':
        cards.edit = { tone: 'neutral', state: 'preparada', sub: `base: g${f.generation} r${f.baseRevision}`, changedAt: s.seq };
        break;
      case 'hold':
        cards.edit = { ...cards.edit, tone: 'neutral', state: 'retida', sub: `${cards.edit.sub} · aguardando entrega`, changedAt: s.seq };
        break;
      case 'release':
      case 'replay': {
        const o = f.writeOutcome ?? '';
        const verb = s.kind === 'replay' ? 'reentregue' : 'entregue';
        if (o === 'UPSERT_INSERTED') {
          // Ainda é só o relato do alvo; o tom de reaparecimento vem do veredito.
          const cause = verdict?.violations.some((v) => v.causedBySeq === s.seq) ?? false;
          const tone: Tone = cause ? 'reappeared' : 'neutral';
          cards.edit = { tone, state: `${verb}: alvo relata recriação`, sub: o, changedAt: s.seq };
          cards.record = { tone, state: 'recriado (segundo o alvo)', sub: `g${f.generation} · revisão ${f.revision}`, source: 'relatado pelo alvo', changedAt: s.seq };
        } else if (o.startsWith('REJECTED') || o === 'DUPLICATE_IGNORED') {
          cards.edit = { tone: 'conflict', state: `${verb}: rejeitada`, sub: o, changedAt: s.seq };
        } else {
          cards.edit = { tone: 'live', state: `${verb}: aplicada`, sub: o, changedAt: s.seq };
          if (f.revision !== undefined) cards.record = { ...cards.record, sub: `g${f.generation} · revisão ${f.revision}`, changedAt: s.seq };
        }
        break;
      }
      case 'delete':
        if (f.wrote) {
          deletedGen = f.generation;
          cards.deletion = { tone: 'deleted', state: 'pedida', sub: `g${f.generation} · aguardando confirmação`, changedAt: s.seq };
          cards.record = { tone: 'deleted', state: 'excluído', sub: `g${f.generation}`, source: 'relatado pelo alvo', deleted: true, changedAt: s.seq };
        }
        break;
      case 'confirm-deletion':
        confirmed = f.confirmed === true;
        cards.deletion = confirmed
          ? { tone: 'deleted', state: 'confirmada', sub: `g${deletedGen ?? '?'} · mecanismo ${f.mechanism}`, changedAt: s.seq }
          : { tone: 'failure', state: 'sem confirmação', sub: `alvo informa "${f.confirmationStatus}"`, changedAt: s.seq };
        break;
      case 'restore':
        if (f.wrote) {
          cards.record = { tone: 'restored', state: 'restaurado', sub: `g${f.generation} · por ${f.authorization?.actor}`, source: 'relatado pelo alvo', changedAt: s.seq };
          cards.deletion = { ...cards.deletion, tone: 'restored', state: 'revertida', sub: 'restauração autorizada', changedAt: s.seq };
        }
        break;
      case 'inspect': {
        if (!f.visible) {
          cards.record = {
            tone: 'deleted',
            state: deletedGen !== undefined ? 'ausente' : 'não encontrado',
            sub: 'leitura retornou 404',
            source: 'visto pelo observador',
            deleted: true,
            changedAt: s.seq,
          };
          break;
        }
        const violated = verdict?.violations.some((v) => v.observedAtSeq === s.seq || v.evidenceSeqs.includes(s.seq));
        const allowance = verdict?.allowances.find((a) => a.observedAtSeq === s.seq);
        const tone: Tone = violated ? 'reappeared' : allowance?.kind === 'new-generation' ? 'new' : allowance ? 'restored' : 'live';
        cards.record = {
          tone,
          state: violated ? 'REAPARECEU' : allowance?.kind === 'new-generation' ? `nova geração g${f.observedGeneration}` : allowance ? 'restaurado (permitido)' : 'vivo',
          sub: `g${f.observedGeneration} · revisão ${f.observedRevision}`,
          source: 'visto pelo observador',
          changedAt: s.seq,
        };
        break;
      }
    }
  }
  return cards;
}
