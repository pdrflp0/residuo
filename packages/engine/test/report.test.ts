import { describe, expect, it } from 'vitest';
import { compareRuns } from '../src/compare';
import { evaluate } from '../src/evaluate';
import { describeStep } from '../src/narrative';
import { buildReport, renderMarkdown } from '../src/report';
import { renderHtml } from '../src/report-html';
import { sanitize } from '../src/sanitize';
import { detail, Trace } from './fixtures';

const vulnerable = () => new Trace().create().deleteG().confirm().absent().release('UPSERT_INSERTED', true).visible(1, 'delivery:dlv_1');
const guarded = () => new Trace().create().deleteG().confirm().absent().release('REJECTED_DELETED', false).absent();

describe('relatório', () => {
  it('JSON e Markdown carregam o mesmo veredito, versão do cenário, semente e limites', () => {
    const report = buildReport(detail('vulnerable', vulnerable()), new Date('2026-10-14T00:00:00Z'));
    const md = renderMarkdown(report);
    expect(report.verdict?.result).toBe('VIOLATION');
    expect(md).toContain('**Resultado:** VIOLATION');
    expect(md).toContain('`held-update-after-delete` v1.0.0');
    expect(md).toContain('| Semente | 1200 |');
    expect(md).toContain('limite do adapter');
    expect(md).toContain('não prova correção em geral');
    expect(report.reproduce.cli).toContain('--seed 1200');
  });

  it('o teste de regressão sugerido usa o mesmo cenário e semente no modo corrigido', () => {
    const md = renderMarkdown(buildReport(detail('vulnerable', vulnerable())));
    expect(md).toMatch(/getScenario\('held-update-after-delete'\)/);
    expect(md).toMatch(/seed: 1200/);
    expect(md).toMatch(/mode: 'guarded'/);
  });
});

describe('comparação', () => {
  it('aponta a mudança de resultado e as etapas que divergiram entre vulnerable e guarded', () => {
    const cmp = compareRuns(detail('vulnerable', vulnerable()), detail('guarded', guarded()));
    expect(cmp.comparable).toBe(true);
    expect(cmp.resultChanged).toBe(true);
    expect(cmp.base.result).toBe('VIOLATION');
    expect(cmp.candidate.result).toBe('NO_VIOLATION_OBSERVED');
    const changed = cmp.steps.filter((s) => s.changed).map((s) => s.stepId);
    expect(changed).toEqual(['release-5', 'inspect-6']);
  });

  it('enquanto uma execução não termina, nada é marcado como diferente', () => {
    const running = detail('guarded', new Trace().create().deleteG());
    running.run.status = 'running';
    delete running.run.verdict;
    const cmp = compareRuns(detail('vulnerable', vulnerable()), running);
    expect(cmp.comparable).toBe(false);
    expect(cmp.resultChanged).toBe(false);
    expect(cmp.steps.filter((s) => s.changed)).toEqual([]);
  });

  it('não chama de comparáveis execuções com sementes diferentes', () => {
    const b = detail('guarded', guarded());
    b.run.config = { ...b.run.config, seed: 7 };
    const cmp = compareRuns(detail('vulnerable', vulnerable()), b);
    expect(cmp.comparable).toBe(false);
    expect(cmp.reasons).toContain('sementes diferentes');
  });
});

describe('sanitize', () => {
  it('mascara credenciais em string e preserva a autorização de política (objeto)', () => {
    const out = sanitize({ headers: { Authorization: 'Bearer abc' }, apiKey: 'k', authorization: { actor: 'op', reason: 'r' } });
    expect(out).toEqual({ headers: { Authorization: '[redacted]' }, apiKey: '[redacted]', authorization: { actor: 'op', reason: 'r' } });
  });
});

describe('narrativa', () => {
  it('um upsert relatado só ganha o tom de reaparecimento quando o veredito o associa a uma leitura', () => {
    const t = new Trace().create().deleteG().confirm('pending').release('UPSERT_INSERTED', true).visible(1, 'delivery:dlv_1');
    const inconclusive = evaluate({ policy: 'delete-wins', steps: t.steps });
    expect(inconclusive.result).toBe('INCONCLUSIVE');
    expect(describeStep(t.steps[3]!, inconclusive).tone).toBe('neutral');

    const v = vulnerable();
    const violation = evaluate({ policy: 'delete-wins', steps: v.steps });
    expect(describeStep(v.steps[4]!, violation).tone).toBe('reappeared');
  });
});

describe('relatório HTML compartilhável', () => {
  it('é um arquivo único, sem recursos externos, com o veredito e as etapas', () => {
    const html = renderHtml(buildReport(detail('vulnerable', vulnerable())));
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|@import|url\(http/i);
    expect(html).toContain('"result":"VIOLATION"');
    expect(html).toContain('"title":"Atualização retida chega depois da exclusão"');
  });

  it('dados de terceiros não conseguem fechar o <script> nem injetar HTML', () => {
    const d = detail('vulnerable', vulnerable());
    d.steps[0]!.exchange = { request: { method: 'GET', path: '/x' }, response: { status: 200, body: { evil: '</script><img src=x onerror=alert(1)>' } }, durationMs: 1 };
    const html = renderHtml(buildReport(d));
    expect(html).not.toContain('</script><img');
    expect(html).toContain('\\u003c/script>');
  });
});
