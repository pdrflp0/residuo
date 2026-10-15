import { describe, expect, it } from 'vitest';
import { extract, render, renderPath, TemplateError } from '../src/adapters/template';
import { allOrders, exploreActions, isValidOrder, scenarioForOrder } from '../src/explore';

describe('modelos do residuo.json', () => {
  const vars = { entityId: 'item 17', generation: 2, data: { title: 'Lista', tags: ['a'] } };

  it('"{{x}}" sozinho vira o valor tipado; dentro de texto, é interpolado', () => {
    expect(render({ g: '{{generation}}', d: '{{data}}', t: 'nota {{data.title}} g{{generation}}' }, vars)).toEqual({
      g: 2,
      d: { title: 'Lista', tags: ['a'] },
      t: 'nota Lista g2',
    });
  });

  it('codifica valores no caminho da URL', () => {
    expect(renderPath('/notes/{{entityId}}?g={{generation}}', vars)).toBe('/notes/item%2017?g=2');
  });

  it('variável ausente é erro explícito, não "undefined" silencioso', () => {
    expect(() => render('{{deliveryId}}', vars)).toThrow(TemplateError);
  });

  it('extrai fatos por caminho, igualdade, lista e código HTTP', () => {
    const body = { note: { version: 3 }, result: 'recreated', items: [{ id: 'x' }] };
    expect(extract('note.version', body, 200)).toBe(3);
    expect(extract('items.0.id', body, 200)).toBe('x');
    expect(extract({ path: 'result', in: ['recreated', 'updated'] }, body, 200)).toBe(true);
    expect(extract({ path: 'result', equals: 'rejected' }, body, 200)).toBe(false);
    expect(extract('$status', body, 409)).toBe(409);
  });
});

describe('ordens de entrega', () => {
  it('só gera ordens válidas: com exclusão e reentrega depois da primeira entrega', () => {
    const orders = allOrders(['delete', 'release-1', 'release-2', 'replay-1']);
    expect(orders).toHaveLength(12);
    expect(orders.every(isValidOrder)).toBe(true);
    expect(isValidOrder(['replay-1', 'release-1', 'delete'])).toBe(false);
    expect(isValidOrder(['release-1'])).toBe(false);
  });

  it('mais clientes: (clientes + 2)! / 2 ordens, e cada reentrega depois da entrega da mesma edição', () => {
    expect(exploreActions(2)).toEqual(['delete', 'release-1', 'release-2', 'replay-1']);
    expect([1, 2, 3, 4].map((n) => allOrders(exploreActions(n)).length)).toEqual([3, 12, 60, 360]);
    expect(allOrders(exploreActions(3, { replay: false }))).toHaveLength(24);
    expect(() => exploreActions(0)).toThrow(RangeError);
    expect(() => exploreActions(5)).toThrow(RangeError);
    expect(isValidOrder(['delete', 'replay-3', 'release-3'])).toBe(false);
    expect(isValidOrder(['release-3', 'delete', 'replay-3'])).toBe(true);
  });

  it('cenário com 3 clientes: todas as edições preparadas sobre a mesma revisão, antes de qualquer entrega', () => {
    const s = scenarioForOrder(['release-3', 'delete', 'release-1', 'release-2']);
    expect(s.steps.slice(0, 7).map((x) => x.id)).toEqual(['create', 'prepare-1', 'hold-1', 'prepare-2', 'hold-2', 'prepare-3', 'hold-3']);
    expect(s.title).toBe('Ordem explorada: edição 3 → exclusão → edição 1 → edição 2');
  });

  it('depois da exclusão, toda ação é seguida de uma leitura', () => {
    const s = scenarioForOrder(['release-1', 'delete', 'release-2']);
    expect(s.steps.map((x) => x.id)).toEqual([
      'create',
      'prepare-1',
      'hold-1',
      'prepare-2',
      'hold-2',
      'release-1',
      'delete',
      'confirm',
      'inspect-after-delete',
      'release-2',
      'inspect-after-release-2',
    ]);
  });
});
