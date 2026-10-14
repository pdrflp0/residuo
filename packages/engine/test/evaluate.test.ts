import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluate';
import { Trace } from './fixtures';

describe('evaluate — invariante "a geração excluída não volta"', () => {
  it('classifica como VIOLATION quando uma leitura após a confirmação vê a geração excluída', () => {
    const t = new Trace().create().deleteG().confirm().absent().release('UPSERT_INSERTED', true).visible(1, 'delivery:dlv_1');
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('VIOLATION');
    expect(v.violations).toHaveLength(1);
    expect(v.violations[0]).toMatchObject({ generation: 1, observedAtSeq: 6, causedBySeq: 5, attribution: 'provenance' });
  });

  it('não usa a resposta de escrita como prova: upsert relatado mas leitura ausente não é violação', () => {
    const t = new Trace().create().deleteG().confirm().release('UPSERT_INSERTED', true).absent();
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('NO_VIOLATION_OBSERVED');
    expect(v.violations).toEqual([]);
  });

  it('sem leitura após a escrita, nada é afirmado: falta de observação vira INCONCLUSIVE', () => {
    const t = new Trace().create().deleteG().confirm().release('UPSERT_INSERTED', true);
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('INCONCLUSIVE');
    expect(v.inconclusiveReasons.join(' ')).toMatch(/Nenhuma leitura/);
  });

  it('visibilidade antes da confirmação não conta como violação', () => {
    const t = new Trace().create().visible(1).deleteG().confirm().absent();
    expect(evaluate({ policy: 'delete-wins', steps: t.steps }).result).toBe('NO_VIOLATION_OBSERVED');
  });

  it('atribui a causa pela ordem quando o alvo não informa a procedência', () => {
    const t = new Trace().create().deleteG().confirm().absent().release('UPSERT_INSERTED', true).visible(1);
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.violations[0]).toMatchObject({ causedBySeq: 5, attribution: 'ordering' });
  });

  it('não inventa causa quando há mais de uma escrita candidata e nenhuma procedência', () => {
    const t = new Trace()
      .create()
      .deleteG()
      .confirm()
      .release('UPSERT_INSERTED', true, 'dlv_1')
      .release('UPSERT_UPDATED', true, 'dlv_2')
      .visible(1);
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('VIOLATION');
    expect(v.violations[0]!.attribution).toBe('unknown');
    expect(v.violations[0]!.causedBySeq).toBeUndefined();
  });
});

describe('evaluate — nova geração e restauração', () => {
  it('uma nova geração criada explicitamente é POLICY_ALLOWED, não ressurreição', () => {
    const t = new Trace().create(1).deleteG(1).confirm().absent().create(2).visible(2);
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('POLICY_ALLOWED');
    expect(v.violations).toEqual([]);
    expect(v.allowances[0]).toMatchObject({ kind: 'new-generation', generation: 2, authorizedBySeq: 5 });
  });

  it('uma geração nova sem criação explícita observada não é aprovada', () => {
    const t = new Trace().create(1).deleteG(1).confirm().visible(2);
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('INCONCLUSIVE');
  });

  const restoreTrace = (authorized: boolean) =>
    new Trace()
      .create()
      .deleteG()
      .confirm()
      .absent()
      .add('restore', {
        entityId: 'item-17',
        writeOutcome: 'RESTORED',
        wrote: true,
        generation: 1,
        revision: 2,
        deletionId: 'del_1',
        opRef: 'restore:rst_1',
        ...(authorized ? { authorization: { actor: 'operador', reason: 'ticket' } } : {}),
      })
      .visible(1, 'restore:rst_1');

  it('restauração autorizada é permitida quando a política declara explicit-restore', () => {
    const v = evaluate({ policy: 'explicit-restore', steps: restoreTrace(true).steps });
    expect(v.result).toBe('POLICY_ALLOWED');
    expect(v.allowances[0]).toMatchObject({ kind: 'authorized-restore', authorizedBySeq: 5 });
  });

  it('a mesma restauração é VIOLATION quando a política declara delete-wins', () => {
    const v = evaluate({ policy: 'delete-wins', steps: restoreTrace(true).steps });
    expect(v.result).toBe('VIOLATION');
    expect(v.violations[0]!.explanation).toMatch(/delete-wins/);
  });

  it('restauração sem autorização registrada não é permitida nem em explicit-restore', () => {
    const v = evaluate({ policy: 'explicit-restore', steps: restoreTrace(false).steps });
    expect(v.result).toBe('VIOLATION');
  });
});

describe('evaluate — INCONCLUSIVE nunca vira aprovação', () => {
  it('confirmação pendente impede qualquer conclusão, mesmo com o registro visível depois', () => {
    const t = new Trace().create().deleteG().confirm('pending').release('UPSERT_INSERTED', true).visible(1);
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('INCONCLUSIVE');
    expect(v.violations).toEqual([]);
    expect(v.inconclusiveReasons[0]).toMatch(/pending/);
  });

  it('falha na confirmação gera INCONCLUSIVE', () => {
    const t = new Trace().create().deleteG().add('confirm-deletion', {}, 'failed').add('inspect', {}, 'skipped');
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('INCONCLUSIVE');
    expect(v.inconclusiveReasons[0]).toMatch(/confirmação/);
  });

  it('timeout na leitura final gera INCONCLUSIVE, não NO_VIOLATION_OBSERVED', () => {
    const t = new Trace().create().deleteG().confirm().absent().release('REJECTED_DELETED', false).add('inspect', {}, 'timeout');
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('INCONCLUSIVE');
    expect(v.inconclusiveReasons[0]).toMatch(/tempo limite/);
  });

  it('uma violação já observada continua sendo VIOLATION mesmo que uma etapa posterior falhe', () => {
    const t = new Trace().create().deleteG().confirm().release('UPSERT_INSERTED', true).visible(1).add('inspect', {}, 'timeout');
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('VIOLATION');
    expect(v.inconclusiveReasons.length).toBeGreaterThan(0);
  });
});

describe('evaluate — evidência insuficiente nunca passa', () => {
  it('exclusão sem geração informada gera INCONCLUSIVE, mesmo com o registro visível depois', () => {
    const t = new Trace()
      .create()
      .add('delete', { entityId: 'item-17', writeOutcome: 'DELETED', wrote: true, deletionId: 'del_1' })
      .confirm()
      .visible(1);
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('INCONCLUSIVE');
    expect(v.inconclusiveReasons.join(' ')).toMatch(/não informou qual geração/);
  });

  it('leitura "ok" sem fato de visibilidade gera INCONCLUSIVE', () => {
    const t = new Trace().create().deleteG().confirm().add('inspect', { entityId: 'item-17' });
    expect(evaluate({ policy: 'delete-wins', steps: t.steps }).result).toBe('INCONCLUSIVE');
  });

  it('uma escrita depois da última leitura deixa o resultado INCONCLUSIVE', () => {
    const t = new Trace().create().deleteG().confirm().absent().release('UPSERT_INSERTED', true);
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('INCONCLUSIVE');
    expect(v.inconclusiveReasons.join(' ')).toMatch(/depois da última escrita \(etapa 5\)/);
  });

  it('restauração de outra exclusão não autoriza o reaparecimento desta', () => {
    const t = new Trace()
      .create()
      .deleteG()
      .confirm()
      .add('restore', {
        entityId: 'item-17',
        writeOutcome: 'RESTORED',
        wrote: true,
        generation: 1,
        deletionId: 'del_outra',
        authorization: { actor: 'op', reason: 'r' },
        opRef: 'restore:rst_1',
      })
      .visible(1, 'restore:rst_1');
    expect(evaluate({ policy: 'explicit-restore', steps: t.steps }).result).toBe('VIOLATION');
  });

  it('procedência que aponta para uma escrita anterior à confirmação não vira "causa"', () => {
    const t = new Trace().create().release('APPLIED', true, 'dlv_1').deleteG().confirm().visible(1, 'delivery:dlv_1');
    const v = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(v.result).toBe('VIOLATION');
    expect(v.violations[0]!.attribution).toBe('unknown');
  });
});

describe('evaluate — determinismo', () => {
  it('a mesma fixture, inclusive após ida e volta em JSON (relatório exportado), produz o mesmo veredito', () => {
    const t = new Trace().create().deleteG().confirm().absent().release('UPSERT_INSERTED', true).visible(1, 'delivery:dlv_1');
    const first = evaluate({ policy: 'delete-wins', steps: t.steps });
    const fromExport = evaluate({ policy: 'delete-wins', steps: JSON.parse(JSON.stringify(t.steps)) });
    expect(fromExport).toEqual(first);
  });
});
