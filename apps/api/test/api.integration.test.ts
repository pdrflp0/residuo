/**
 * API real (Nest + Postgres lab) contra o serviço de referência real (Nest + Postgres target).
 */
import type { AddressInfo } from 'node:net';
import type { AiSummary, ReportV1, Run, RunComparison, RunDetail } from '@residuo/contracts';
import { createReferenceApp } from '@residuo/reference-service';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/app';

const TARGET_DB = process.env.TEST_TARGET_DATABASE_URL ?? 'postgres://residuo:residuo-local-only@localhost:54329/residuo_target_test';
const LAB_DB = process.env.TEST_LAB_DATABASE_URL ?? 'postgres://residuo:residuo-local-only@localhost:54329/residuo_lab_test';

let ref: Awaited<ReturnType<typeof createReferenceApp>>;
let api: Awaited<ReturnType<typeof createApiApp>>;
let base = '';

beforeAll(async () => {
  ref = await createReferenceApp({ databaseUrl: TARGET_DB, logger: false });
  await ref.listen(0, '127.0.0.1');
  const refUrl = `http://127.0.0.1:${(ref.getHttpServer().address() as AddressInfo).port}`;
  api = await createApiApp({ databaseUrl: LAB_DB, referenceServiceUrl: refUrl, logger: false });
  await api.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(api.getHttpServer().address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  await api?.close();
  await ref?.close();
});

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T; text: string; headers: Headers }> {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* markdown */
  }
  return { status: res.status, body: parsed as T, text, headers: res.headers };
}

/** Espera por estado observável da API (não por tempo fixo). */
async function until(id: string, done: (d: RunDetail) => boolean): Promise<RunDetail> {
  for (let i = 0; i < 200; i++) {
    const { body } = await call<RunDetail>('GET', `/runs/${id}`);
    if (done(body)) return body;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`execução ${id} não chegou ao estado esperado`);
}
const finished = (d: RunDetail) => d.run.status === 'completed' || d.run.status === 'interrupted';

describe('API de execuções', () => {
  it('executa, persiste observações e exporta relatórios coerentes com a execução', async () => {
    const created = await call<Run>('POST', '/runs', { scenarioId: 'held-update-after-delete', mode: 'vulnerable' });
    expect(created.status).toBe(202);
    expect(created.body).toMatchObject({ status: 'queued', entityId: 'item-17', scenarioVersion: '1.0.0' });

    const detail = await until(created.body.id, finished);
    expect(detail.run.verdict?.result).toBe('VIOLATION');
    expect(detail.steps).toHaveLength(9);
    expect(detail.steps.find((s) => s.stepId === 'release')?.facts.writeOutcome).toBe('UPSERT_INSERTED');

    const json = await call<ReportV1>('GET', `/runs/${created.body.id}/report.json`);
    expect(json.headers.get('content-disposition')).toContain('attachment');
    expect(json.body.schema).toBe('residuo.report/v1');
    expect(json.body.verdict).toEqual(detail.run.verdict);
    expect(json.body.steps).toEqual(detail.steps);

    const md = await call<string>('GET', `/runs/${created.body.id}/report.md`);
    expect(md.headers.get('content-type')).toContain('text/markdown');
    expect(md.text).toContain('**Resultado:** VIOLATION');
    expect(md.text).toContain(created.body.id);

    const html = await call<string>('GET', `/runs/${created.body.id}/report.html`);
    expect(html.headers.get('content-type')).toContain('text/html');
    expect(html.text).toContain(created.body.id);
    expect(html.text).toContain('"result":"VIOLATION"');
  });

  it('replay preserva cenário, versão, semente e ordem, e chega à mesma classificação', async () => {
    const first = await call<Run>('POST', '/runs', { scenarioId: 'replay-after-delete', mode: 'vulnerable', seed: 42 });
    const a = await until(first.body.id, finished);
    const replay = await call<Run>('POST', `/runs/${first.body.id}/replay`);
    expect(replay.status).toBe(202);
    expect(replay.body.replayOf).toBe(first.body.id);
    expect(replay.body.config).toEqual(a.run.config);
    const b = await until(replay.body.id, finished);
    expect(b.steps.map((s) => [s.stepId, s.facts.writeOutcome, s.facts.visible])).toEqual(a.steps.map((s) => [s.stepId, s.facts.writeOutcome, s.facts.visible]));
    expect(b.run.verdict?.result).toBe(a.run.verdict?.result);
    expect(b.run.namespace).not.toBe(a.run.namespace);
  });

  it('compara vulnerable × guarded na mesma configuração', async () => {
    const v = await call<Run>('POST', '/runs', { scenarioId: 'held-update-after-delete', mode: 'vulnerable' });
    await until(v.body.id, finished);
    const g = await call<Run>('POST', `/runs/${v.body.id}/counterpart`, { mode: 'guarded' });
    expect(g.body.config.mode).toBe('guarded');
    await until(g.body.id, finished);
    const cmp = await call<{ comparison: RunComparison }>('GET', `/comparisons?base=${v.body.id}&candidate=${g.body.id}`);
    expect(cmp.body.comparison).toMatchObject({
      comparable: true,
      resultChanged: true,
      base: { mode: 'vulnerable', result: 'VIOLATION' },
      candidate: { mode: 'guarded', result: 'NO_VIOLATION_OBSERVED' },
    });
    expect(cmp.body.comparison.steps.filter((s) => s.changed).map((s) => s.stepId)).toEqual(['release', 'inspect-after']);
  });

  it('modo manual: cada etapa espera uma barreira explícita', async () => {
    const created = await call<Run>('POST', '/runs', { scenarioId: 'new-generation-control', mode: 'guarded', stepMode: 'manual' });
    const id = created.body.id;
    let d = await until(id, (x) => x.run.status === 'paused');
    expect(d.run.nextStepId).toBe('create');
    expect(d.steps).toHaveLength(0);

    for (let i = 1; i <= 6; i++) {
      expect((await call('POST', `/runs/${id}/advance`)).status).toBe(200);
      d = await until(id, (x) => x.steps.length === i && (x.run.status === 'paused' || finished(x)));
    }
    expect(d.run.status).toBe('completed');
    expect(d.run.verdict?.result).toBe('POLICY_ALLOWED');
    expect((await call('POST', `/runs/${id}/advance`)).status).toBe(409);
  });

  it('falha injetada termina como INCONCLUSIVE e o motivo vai para o relatório', async () => {
    const created = await call<Run>('POST', '/runs', { scenarioId: 'held-update-after-delete', mode: 'guarded', fault: 'confirm-unavailable' });
    const d = await until(created.body.id, finished);
    expect(d.run.verdict?.result).toBe('INCONCLUSIVE');
    const md = await call<string>('GET', `/runs/${created.body.id}/report.md`);
    expect(md.text).toContain('A confirmação da exclusão não foi obtida');
  });

  it('valida a entrada', async () => {
    expect((await call('POST', '/runs', { scenarioId: 'nao-existe', mode: 'guarded' })).status).toBe(404);
    expect((await call('POST', '/runs', { scenarioId: 'held-update-after-delete', mode: 'producao' })).status).toBe(400);
    expect((await call('POST', '/runs', { scenarioId: 'held-update-after-delete', mode: 'guarded', timeoutMs: 5 })).status).toBe(400);
    expect((await call('GET', '/runs/../../etc')).status).toBe(404);
    expect((await call('GET', '/runs/nao-e-um-id')).status).toBe(400);
  });

  it('reset da execução limpa somente o namespace dela', async () => {
    const created = await call<Run>('POST', '/runs', { scenarioId: 'held-update-after-delete', mode: 'vulnerable' });
    await until(created.body.id, finished);
    const reset = await call<{ namespace: string }>('DELETE', `/runs/${created.body.id}/target-data`);
    expect(reset.status).toBe(200);
    expect(reset.body.namespace).toBe(created.body.namespace);
    // a evidência gravada no laboratório continua disponível
    const d = await call<RunDetail>('GET', `/runs/${created.body.id}`);
    expect(d.body.steps).toHaveLength(9);
  });
});

/**
 * Modelo simulado: responde no formato da API de mensagens, montando o resumo a partir do relatório
 * recebido (cita a leitura da violação e a causa). Conta as chamadas para testar cache e deduplicação.
 */
function fakeClaude(override?: Partial<Record<string, unknown>>) {
  const state = { calls: 0, lastBody: undefined as any };
  const fetch = (async (_url: string | URL, init?: RequestInit) => {
    state.calls++;
    state.lastBody = JSON.parse(String(init?.body));
    const content: string = state.lastBody.messages[0].content;
    const input = JSON.parse(content.slice(content.indexOf('<relatorio>') + 11, content.indexOf('</relatorio>')));
    const v = input.verdict.violations[0];
    const out = {
      verdict: input.verdict.result,
      headline: 'A edição retida recriou o registro depois da exclusão confirmada.',
      findings: [{ text: 'O consumidor fez upsert e a leitura seguinte viu a geração excluída.', steps: [v.causedBySeq, v.observedAtSeq] }],
      nextSteps: [],
      ...override,
    };
    const message = { id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } };
    return new Response(JSON.stringify(message), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return { state, fetch };
}

describe('resumo com IA (opcional)', () => {
  it('sem chave: /about mostra desligado e o pedido responde 503 explicando como ligar', async () => {
    const about = await call<{ ai: { enabled: boolean } }>('GET', '/about');
    expect(about.body.ai.enabled).toBe(false);
    const created = await call<Run>('POST', '/runs', { scenarioId: 'held-update-after-delete', mode: 'vulnerable' });
    await until(created.body.id, finished);
    const r = await call<{ message: string }>('POST', `/runs/${created.body.id}/summary`);
    expect(r.status).toBe(503);
    expect(r.body.message).toContain('ANTHROPIC_API_KEY');
  });

  it('com chave: gera, confere, salva e aparece no detalhe e nos relatórios; não muda o veredito', async () => {
    const claude = fakeClaude();
    const app = await createApiApp({ databaseUrl: LAB_DB, referenceServiceUrl: 'http://127.0.0.1:1', logger: false, ai: { apiKey: 'test-key', fetch: claude.fetch } });
    await app.listen(0, '127.0.0.1');
    const other = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
    try {
      // a execução vem da API principal (com alvo); a segunda instância só lê o mesmo laboratório
      const created = await call<Run>('POST', '/runs', { scenarioId: 'held-update-after-delete', mode: 'vulnerable' });
      const before = await until(created.body.id, finished);

      const [a, b] = await Promise.all([1, 2].map(() => fetch(`${other}/runs/${created.body.id}/summary`, { method: 'POST' }).then(async (r) => ({ status: r.status, body: (await r.json()) as AiSummary }))));
      expect([a!.status, b!.status]).toEqual([200, 200]);
      expect(claude.state.calls).toBe(1); // pedidos simultâneos compartilham uma chamada
      expect(a!.body).toMatchObject({ runId: created.body.id, verdict: 'VIOLATION', findings: [{ steps: [8, 9] }] });

      // já salvo: não chama de novo; refresh=1 chama
      await fetch(`${other}/runs/${created.body.id}/summary`, { method: 'POST' });
      expect(claude.state.calls).toBe(1);
      await fetch(`${other}/runs/${created.body.id}/summary?refresh=1`, { method: 'POST' });
      expect(claude.state.calls).toBe(2);

      const d = await call<RunDetail>('GET', `/runs/${created.body.id}`);
      expect(d.body.aiSummary?.headline).toBe('A edição retida recriou o registro depois da exclusão confirmada.');
      expect(d.body.run.verdict).toEqual(before.run.verdict);
      expect((await call<ReportV1>('GET', `/runs/${created.body.id}/report.json`)).body.aiSummary?.findings[0]?.steps).toEqual([8, 9]);
      expect((await call<string>('GET', `/runs/${created.body.id}/report.md`)).text).toContain('## Resumo gerado por IA');
    } finally {
      await app.close();
    }
  });

  it('resumo que contradiz o veredito é descartado (502) e nada é salvo', async () => {
    const claude = fakeClaude({ verdict: 'NO_VIOLATION_OBSERVED' });
    const app = await createApiApp({ databaseUrl: LAB_DB, referenceServiceUrl: 'http://127.0.0.1:1', logger: false, ai: { apiKey: 'test-key', fetch: claude.fetch } });
    await app.listen(0, '127.0.0.1');
    const other = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
    try {
      const created = await call<Run>('POST', '/runs', { scenarioId: 'held-update-after-delete', mode: 'vulnerable' });
      await until(created.body.id, finished);
      const r = await fetch(`${other}/runs/${created.body.id}/summary`, { method: 'POST' });
      expect(r.status).toBe(502);
      const body = (await r.json()) as { message: string; problems: string[] };
      expect(body.problems).toContain('o resumo diz NO_VIOLATION_OBSERVED, mas o veredito do avaliador é VIOLATION');
      expect((await call<RunDetail>('GET', `/runs/${created.body.id}`)).body.aiSummary).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
