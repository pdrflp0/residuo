/**
 * Substituto local da API de mensagens da Anthropic, só para testes (sem rede, sem custo, sem chave real).
 * Monta o resumo a partir do relatório recebido, como um modelo obediente faria: repete o veredito e cita
 * a confirmação, a causa e a leitura da violação. O caminho de produção (SDK, conferência, gravação) é o real.
 *
 * Uso direto (ponta a ponta): STUB_PORT=4199 npx tsx tests/support/anthropic-stub.ts
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';

export function createAnthropicStub(): Server {
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') return void res.end('ok');
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
      res.statusCode = 404;
      return void res.end();
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      const content: string = body.messages[0].content;
      const input = JSON.parse(content.slice(content.indexOf('<relatorio>') + 11, content.indexOf('</relatorio>')));
      const v = input.verdict.violations[0];
      const last = input.steps.at(-1).seq;
      const out = {
        verdict: input.verdict.result,
        headline: v ? 'A edição retida recriou o registro depois da exclusão confirmada.' : 'O registro continuou apagado em todas as leituras.',
        findings: v
          ? [
              { text: 'A exclusão foi confirmada antes de a edição antiga ser entregue.', steps: [input.verdict.confirmationSeq] },
              { text: 'O consumidor aplicou a edição com upsert e a leitura seguinte viu a geração excluída.', steps: [v.causedBySeq, v.observedAtSeq] },
            ]
          : [{ text: 'A última leitura não encontrou o registro.', steps: [last] }],
        nextSteps: v ? [{ text: 'Recusar atualizações de uma geração já excluída.', steps: [v.causedBySeq] }] : [],
      };
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          id: 'msg_stub',
          type: 'message',
          role: 'assistant',
          model: body.model,
          content: [{ type: 'text', text: JSON.stringify(out) }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
      );
    });
  });
}

export async function startAnthropicStub(port = 0): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createAnthropicStub();
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', () => r()));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url } = await startAnthropicStub(Number(process.env.STUB_PORT ?? 4199));
  console.log(`[stub-anthropic] ouvindo em ${url}`);
}
