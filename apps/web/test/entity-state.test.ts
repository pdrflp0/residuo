import { evaluate } from '@residuo/engine';
import { describe, expect, it } from 'vitest';
import { Trace } from '../../../packages/engine/test/fixtures';
import { deriveCards } from '../src/entity-state';

describe('cartões de entidade', () => {
  it('distinguem o que o alvo relatou do que o observador viu', () => {
    const t = new Trace().create().deleteG().confirm().absent().release('UPSERT_INSERTED', true).visible(1, 'delivery:dlv_1');
    const verdict = evaluate({ policy: 'delete-wins', steps: t.steps });

    const afterWrite = deriveCards(t.steps, 5, verdict);
    expect(afterWrite.record.source).toBe('relatado pelo alvo');

    const afterRead = deriveCards(t.steps, 6, verdict);
    expect(afterRead.record).toMatchObject({ state: 'REAPARECEU', tone: 'reappeared', source: 'visto pelo observador' });
  });

  it('não pintam como reaparecimento um upsert que o veredito não sustenta', () => {
    const t = new Trace().create().deleteG().confirm('pending').release('UPSERT_INSERTED', true).visible(1);
    const verdict = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(verdict.result).toBe('INCONCLUSIVE');
    const cards = deriveCards(t.steps, t.steps.length, verdict);
    expect(cards.edit.tone).toBe('neutral');
    expect(cards.record.tone).not.toBe('reappeared');
    expect(cards.deletion.state).toBe('sem confirmação');
  });

  it('só mostram o que já foi revelado', () => {
    const t = new Trace().create().deleteG();
    expect(deriveCards(t.steps, 0).record.state).toBe('ainda não existe');
    expect(deriveCards(t.steps, 1).record.state).toBe('vivo');
  });
});
