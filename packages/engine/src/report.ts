import type { AiSummary, ReportV1, RunDetail, StepObservation } from '@residuo/contracts';
import { describeStep } from './narrative';

export const ENGINE_VERSION = '0.1.0';

export const ENGINE_LIMITS = [
  'Ausência de violação vale para esta sequência e estes pontos de observação; não prova correção em geral.',
  'A ordem é controlada por barreiras explícitas: a reexecução reproduz este interleaving, não a temporização de uma corrida real.',
  'A semente gera apenas os dados sintéticos. Outras ordens de entrega são exploradas pelo comando `residuo explore`, não por esta execução.',
  'Ausência numa leitura não equivale a apagamento físico de todas as cópias (réplicas, caches, backups, logs).',
  'Não é certificação de privacidade, conformidade legal nem exclusão criptograficamente comprovada.',
];

export function buildReport(detail: RunDetail, generatedAt: Date = new Date()): ReportV1 {
  const { run } = detail;
  const c = run.config;
  return {
    schema: 'residuo.report/v1',
    generatedAt: generatedAt.toISOString(),
    disclaimer:
      c.mode === 'external'
        ? 'Dados sintéticos gerados pelo Resíduo num namespace de teste do sistema descrito no residuo.json.'
        : 'Dados sintéticos de demonstração, gerados contra o serviço de referência local.',
    run,
    scenario: detail.scenario,
    steps: detail.steps,
    ...(run.verdict ? { verdict: run.verdict } : {}),
    limits: [...ENGINE_LIMITS, ...run.adapter.limits],
    reproduce: {
      api: {
        method: 'POST',
        path: '/api/runs',
        body: { scenarioId: c.scenarioId, mode: c.mode, policy: c.policy, seed: c.seed, fault: c.fault, timeoutMs: c.timeoutMs },
      },
      cli: `npm run lab -- --scenario ${c.scenarioId} --mode ${c.mode} --policy ${c.policy} --seed ${c.seed} --fault ${c.fault} --timeout ${c.timeoutMs}`,
    },
    ...(detail.aiSummary ? { aiSummary: detail.aiSummary } : {}),
  };
}

const VERDICT_LABEL: Record<string, string> = {
  VIOLATION: 'VIOLATION — a geração excluída voltou',
  NO_VIOLATION_OBSERVED: 'NO_VIOLATION_OBSERVED — nenhuma violação nos pontos observados',
  INCONCLUSIVE: 'INCONCLUSIVE — faltou evidência para concluir',
  POLICY_ALLOWED: 'POLICY_ALLOWED — reaparecimento permitido pela política, com evidência',
};

export function renderMarkdown(report: ReportV1): string {
  const { run, scenario, steps, verdict } = report;
  const c = run.config;
  const lines: string[] = [];
  lines.push(`# Relatório Resíduo — ${scenario.title}`);
  lines.push('');
  lines.push(`> ${report.disclaimer}`);
  lines.push('');
  lines.push(`**Resultado:** ${verdict ? VERDICT_LABEL[verdict.result] : `sem veredito (status ${run.status})`}`);
  lines.push('');
  if (verdict) lines.push(verdict.summary, '');
  if (report.aiSummary) lines.push(...renderAiSummaryMarkdown(report.aiSummary));
  lines.push('## Configuração', '');
  lines.push('| Campo | Valor |', '| --- | --- |');
  const rows: [string, string][] = [
    ['Execução', `\`${run.id}\``],
    ['Cenário', `\`${scenario.id}\` v${scenario.version}`],
    ['Modo do alvo', `\`${c.mode}\``],
    ['Política declarada', `\`${c.policy}\``],
    ['Semente', String(c.seed)],
    ['Falha injetada', `\`${c.fault}\``],
    ['Registro testado', `\`${run.entityId}\``],
    ['Namespace', `\`${run.namespace}\``],
    ['Engine', `v${run.engineVersion}`],
    ['Adapter', `${run.adapter.name} v${run.adapter.version}`],
    ['Gerado em', report.generatedAt],
  ];
  if (run.replayOf) rows.push(['Reexecução de', `\`${run.replayOf}\``]);
  for (const [k, v] of rows) lines.push(`| ${k} | ${v} |`);
  lines.push('');

  lines.push('## Linha do tempo', '');
  lines.push('| # | Faixa | Etapa | Status | Resposta | O que foi registrado |', '| --- | --- | --- | --- | --- | --- |');
  for (const s of steps) {
    const n = describeStep(s, verdict);
    lines.push(`| ${s.seq} | ${s.lane} | ${s.title} | ${s.status} | ${s.exchange?.response?.status ?? '—'} | ${escapeCell(n.headline)} |`);
  }
  lines.push('');

  if (verdict && verdict.violations.length > 0) {
    lines.push('## Violações', '');
    for (const v of verdict.violations) {
      lines.push(`### \`${v.invariant}\` — ${v.entityId} g${v.generation}`, '');
      lines.push(v.explanation, '');
      lines.push(`Atribuição da causa: **${v.attribution}**${v.causedBySeq ? ` (etapa ${v.causedBySeq})` : ''}.`, '');
      lines.push('Evidências:', '');
      for (const seq of v.evidenceSeqs) {
        const s = steps.find((x) => x.seq === seq);
        if (s) lines.push(...evidenceBlock(s));
      }
    }
  }

  if (verdict && verdict.allowances.length > 0) {
    lines.push('## Reaparecimentos permitidos', '');
    for (const a of verdict.allowances) lines.push(`- **${a.kind}** — ${a.explanation}`);
    lines.push('');
  }

  if (verdict && verdict.inconclusiveReasons.length > 0) {
    lines.push('## Motivos de inconclusão / observações', '');
    for (const r of verdict.inconclusiveReasons) lines.push(`- ${r}`);
    lines.push('');
  }

  if (verdict) {
    lines.push('## Pontos verificados', '');
    for (const p of verdict.checkedPoints) {
      lines.push(
        `- Etapa ${p.seq} (\`${p.stepId}\`): ${p.visible ? `visível g${p.observedGeneration ?? '?'}` : 'ausente'}${p.afterConfirmation ? ' — após a confirmação' : ''}`,
      );
    }
    lines.push('');
  }

  lines.push('## Como reproduzir', '');
  lines.push('Com o ambiente local no ar (ver README):', '');
  lines.push('```bash', report.reproduce.cli, '```', '');
  lines.push('Ou via API:', '');
  lines.push('```bash');
  lines.push(`curl -s -X POST http://localhost:4000/api/runs -H 'content-type: application/json' -d '${JSON.stringify(report.reproduce.api.body)}'`);
  lines.push('```', '');

  lines.push('## Teste de regressão sugerido', '');
  lines.push('Para acompanhar a correção: o mesmo cenário, a mesma semente, exigindo ausência de violação.', '');
  lines.push('```ts', regressionTest(report), '```', '');

  lines.push('## Limites desta evidência', '');
  for (const l of report.limits) lines.push(`- ${l}`);
  lines.push('');
  return lines.join('\n');
}

const cite = (steps: number[]) => ` _(etapa${steps.length > 1 ? 's' : ''} ${steps.join(', ')})_`;

/** Seção Markdown do resumo com IA (também usada pela CLI `residuo summarize`). */
export function renderAiSummaryMarkdown(ai: AiSummary): string[] {
  const lines = ['## Resumo gerado por IA', ''];
  lines.push(`> Escrito por \`${ai.model}\` a partir das evidências abaixo. Não decide o veredito. Cada afirmação cita as etapas usadas, e as citações foram conferidas.`, '');
  lines.push(`**${ai.headline}**`, '');
  for (const f of ai.findings) lines.push(`- ${f.text}${cite(f.steps)}`);
  lines.push('');
  if (ai.nextSteps.length) {
    lines.push('O que investigar:', '');
    for (const f of ai.nextSteps) lines.push(`- ${f.text}${cite(f.steps)}`);
    lines.push('');
  }
  return lines;
}

export function regressionTest(report: ReportV1): string {
  const c = report.run.config;
  return `import { expect, test } from 'vitest';
import { executeScenario, getScenario, ReferenceHttpAdapter } from '@residuo/engine';

// Gerado a partir da execução ${report.run.id} (${c.scenarioId} v${c.scenarioVersion}, semente ${c.seed}).
// Ajuste \`mode\` para a configuração corrigida do alvo. No serviço de referência, \`guarded\` corrige
// os cenários de entrega atrasada e replay; uma restauração autorizada sob "delete-wins" não tem modo
// corretivo: este teste só passa quando a política ou o serviço mudarem.
test('${c.scenarioId}: a geração excluída não volta (semente ${c.seed})', async () => {
  const scenario = getScenario('${c.scenarioId}')!;
  const { verdict } = await executeScenario({
    scenario,
    config: {
      scenarioId: scenario.id,
      scenarioVersion: '${c.scenarioVersion}',
      mode: 'guarded',
      policy: '${c.policy}',
      seed: ${c.seed},
      fault: 'none',
      stepMode: 'auto',
      timeoutMs: ${c.timeoutMs},
    },
    namespace: \`rsd-regression-\${Date.now()}\`,
    adapter: new ReferenceHttpAdapter(process.env.REFERENCE_SERVICE_URL ?? 'http://localhost:4100'),
  });
  expect(verdict.violations).toEqual([]);
  expect(verdict.result).not.toBe('INCONCLUSIVE');
});`;
}

function evidenceBlock(s: StepObservation): string[] {
  const out = [`**Etapa ${s.seq} — ${s.title}** (${s.lane}, ${s.status})`, ''];
  if (s.exchange) {
    out.push('```http', `${s.exchange.request.method} ${s.exchange.request.path}`);
    if (s.exchange.request.body !== undefined) out.push(JSON.stringify(s.exchange.request.body, null, 2));
    out.push('```');
    if (s.exchange.response) {
      out.push('```json', `// HTTP ${s.exchange.response.status}`, JSON.stringify(s.exchange.response.body, null, 2), '```');
    }
  }
  out.push('');
  return out;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
