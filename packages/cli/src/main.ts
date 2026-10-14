/**
 * residuo — CLI para testar um sistema com o Resíduo, local ou no CI.
 *
 * Códigos de saída: 0 = nenhuma violação observada (ou permitida pela política)
 *                   1 = VIOLATION   2 = INCONCLUSIVE   64 = uso incorreto   65 = residuo.json inválido
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Fault, Mode, Policy, type ResolvedRunConfig, type Run, type TargetAdapter, TargetConfig, type TargetMode, type Verdict } from '@residuo/contracts';
import {
  buildReport,
  ConfigHttpAdapter,
  DEFAULT_SEED,
  describeStep,
  ENGINE_VERSION,
  executeScenario,
  exploreOrders,
  getScenario,
  missingRequirements,
  ReferenceHttpAdapter,
  renderHtml,
  renderMarkdown,
  requiredCapabilities,
  SCENARIOS,
  type Scenario,
  summarizeScenario,
} from '@residuo/engine';
import { z } from 'zod';

const HELP = `residuo — reproduz o reaparecimento de registros apagados e prova o que aconteceu

Uso:
  residuo scenarios                                lista cenários e capacidades exigidas
  residuo check   --config residuo.json            valida o arquivo e mostra o que dá para testar
  residuo run     (--config residuo.json | --reference) [opções]
  residuo explore (--config residuo.json | --reference) [opções]
  residuo schema                                   imprime o JSON Schema do residuo.json

Opções:
  --scenario <id|all>     cenário (padrão: todos os suportados pelo alvo)
  --var chave=valor       variável para os modelos do residuo.json (repetível)
  --seed <n>              semente dos dados sintéticos (padrão ${DEFAULT_SEED})
  --policy <p>            delete-wins | explicit-restore (padrão: o do cenário)
  --timeout <ms>          tempo limite por chamada (padrão 3000)
  --budget <n>            explore: máximo de ordens a executar
  --report <pasta>        grava relatório Markdown, JSON e HTML (compartilhável) de cada execução
  --json                  saída para máquinas (CI)
  --keep                  não limpa os dados de teste no alvo ao final
  --allow-remote          permite alvo fora de localhost (só em ambientes que você está autorizado a testar)
  --reference             usa o serviço de referência local (--mode vulnerable|guarded, --fault, --reference-url)

Saída: 0 = sem violação · 1 = VIOLATION · 2 = INCONCLUSIVE · 64 = uso · 65 = configuração inválida`;

class CliError extends Error {
  constructor(
    message: string,
    readonly code = 64,
  ) {
    super(message);
  }
}

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string' },
    reference: { type: 'boolean', default: false },
    'reference-url': { type: 'string' },
    mode: { type: 'string' },
    fault: { type: 'string' },
    scenario: { type: 'string' },
    var: { type: 'string', multiple: true, default: [] },
    seed: { type: 'string' },
    policy: { type: 'string' },
    timeout: { type: 'string', default: '3000' },
    budget: { type: 'string' },
    report: { type: 'string' },
    json: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
    'allow-remote': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const out = (s = '') => {
  if (!opt.json) console.log(s);
};

interface Target {
  adapter: TargetAdapter;
  mode: TargetMode;
  label: string;
}

async function loadTarget(): Promise<Target> {
  const timeoutMs = Number(opt.timeout);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100) throw new CliError('--timeout inválido');
  if (opt.reference && opt.config) throw new CliError('use --config ou --reference, não os dois');
  if (opt.reference) {
    const mode = Mode.safeParse(opt.mode ?? 'vulnerable');
    if (!mode.success) throw new CliError('--mode deve ser vulnerable ou guarded');
    const url = opt['reference-url'] ?? process.env.REFERENCE_SERVICE_URL ?? 'http://127.0.0.1:4100';
    guardHost(url);
    return { adapter: new ReferenceHttpAdapter(url), mode: mode.data, label: `serviço de referência (${mode.data})` };
  }
  if (!opt.config) throw new CliError('informe --config residuo.json ou --reference');
  const config = await readConfig(opt.config);
  guardHost(config.baseUrl);
  const vars = Object.fromEntries(
    (opt.var ?? []).map((kv) => {
      const i = kv.indexOf('=');
      if (i < 1) throw new CliError(`--var precisa ser chave=valor (recebido "${kv}")`);
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  const shown = Object.entries({ ...config.vars, ...vars })
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  return { adapter: new ConfigHttpAdapter(config, vars), mode: 'external', label: `${config.name}${shown ? ` (${shown})` : ''}` };
}

async function readConfig(path: string): Promise<TargetConfig> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(resolve(path), 'utf8'));
  } catch (err) {
    throw new CliError(`não foi possível ler ${path}: ${(err as Error).message}`, 65);
  }
  const parsed = TargetConfig.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`).join('\n');
    throw new CliError(`${path} inválido:\n${issues}`, 65);
  }
  return parsed.data;
}

/** Testes do Resíduo criam, editam e apagam dados: por padrão, só em máquinas locais. */
function guardHost(url: string) {
  const host = new URL(url).hostname;
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) || host.endsWith('.localhost');
  if (!local && !opt['allow-remote']) {
    throw new CliError(
      `o alvo ${host} não é local. O Resíduo cria, altera e apaga dados durante o teste.\n` +
        'Use --allow-remote somente em ambientes de teste que você está autorizado a modificar.',
    );
  }
}

function pickScenarios(adapter: TargetAdapter): { run: Scenario[]; skipped: { scenario: Scenario; missing: string[] }[] } {
  const descriptor = adapter.describe();
  if (opt.scenario && opt.scenario !== 'all') {
    const s = getScenario(opt.scenario);
    if (!s) throw new CliError(`cenário desconhecido: ${opt.scenario}. Disponíveis: ${SCENARIOS.map((x) => x.id).join(', ')}`);
    return { run: [s], skipped: [] }; // escolhido explicitamente: roda mesmo sem capacidade (vira INCONCLUSIVE)
  }
  const run: Scenario[] = [];
  const skipped: { scenario: Scenario; missing: string[] }[] = [];
  for (const s of SCENARIOS) {
    const missing = missingRequirements(s, descriptor);
    if (missing.length) skipped.push({ scenario: s, missing });
    else run.push(s);
  }
  return { run, skipped };
}

const exitFor = (results: Verdict['result'][]) => (results.includes('VIOLATION') ? 1 : results.includes('INCONCLUSIVE') ? 2 : 0);
const newNamespace = (tag: string) => `rsd-${tag}-${randomUUID().slice(0, 8)}`;

async function cmdRun(): Promise<number> {
  const target = await loadTarget();
  const { run, skipped } = pickScenarios(target.adapter);
  const seed = Number(opt.seed ?? DEFAULT_SEED);
  const results: Record<string, unknown>[] = [];
  out(`alvo: ${target.label}\n`);

  for (const scenario of run) {
    const policy = Policy.parse(opt.policy ?? scenario.defaultPolicy);
    const config: ResolvedRunConfig = {
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      mode: target.mode,
      policy,
      seed,
      fault: Fault.parse(opt.fault ?? 'none'),
      stepMode: 'auto',
      timeoutMs: Number(opt.timeout),
    };
    const namespace = newNamespace('cli');
    const started = new Date().toISOString();
    const { steps, verdict, entityId } = await executeScenario({ scenario, config, namespace, adapter: target.adapter });
    if (!opt.keep) await target.adapter.resetNamespace(namespace, { timeoutMs: 3000 }).catch(() => undefined);

    out(`${scenario.title}  [${scenario.id} v${scenario.version}]`);
    for (const s of steps) {
      out(`  ${String(s.seq).padStart(2)}. ${s.lane.padEnd(9)} ${s.title.padEnd(28)} ${String(s.exchange?.response?.status ?? '---').padEnd(4)} ${describeStep(s, verdict).headline}`);
    }
    out(`  => ${verdict.result}: ${verdict.summary}\n`);

    if (opt.report) {
      const run: Run = {
        id: `cli_${namespace.slice(-8)}`,
        scenarioId: scenario.id,
        scenarioVersion: scenario.version,
        engineVersion: ENGINE_VERSION,
        adapter: target.adapter.describe(),
        config,
        namespace,
        entityId,
        status: 'completed',
        createdAt: started,
        finishedAt: new Date().toISOString(),
        verdict,
      };
      const report = buildReport({ run, scenario: summarizeScenario(scenario), steps });
      const dir = resolve(opt.report);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${scenario.id}.json`), JSON.stringify(report, null, 2));
      await writeFile(join(dir, `${scenario.id}.md`), renderMarkdown(report));
      await writeFile(join(dir, `${scenario.id}.html`), renderHtml(report));
    }
    results.push({ scenario: scenario.id, version: scenario.version, policy, namespace, entityId, verdict });
  }

  for (const { scenario, missing } of skipped) out(`pulado: ${scenario.id} (faltam capacidades: ${missing.join(', ')})`);
  if (run.length === 0) throw new CliError('nenhum cenário compatível com as capacidades do alvo', 2);

  const code = exitFor(results.map((r) => (r.verdict as Verdict).result));
  if (opt.json) {
    console.log(
      JSON.stringify(
        {
          schema: 'residuo.cli/v1',
          target: { label: target.label, adapter: target.adapter.describe() },
          seed,
          results,
          skipped: skipped.map((s) => ({ scenario: s.scenario.id, missing: s.missing })),
          exitCode: code,
        },
        null,
        2,
      ),
    );
  }
  return code;
}

async function cmdExplore(): Promise<number> {
  const target = await loadTarget();
  const caps = target.adapter.describe().capabilities;
  const need = ['create-entity', 'prepare-update', 'hold-release-delivery', 'delete-entity', 'confirm-deletion', 'inspect-entity'] as const;
  const missing = need.filter((c) => !caps.includes(c));
  if (missing.length) throw new CliError(`explore precisa das capacidades: ${missing.join(', ')}`, 2);

  const seed = Number(opt.seed ?? DEFAULT_SEED);
  const namespaces: string[] = [];
  const prefix = newNamespace('exp');
  out(`alvo: ${target.label}\nexplorando ordens de entrega…`);
  const result = await exploreOrders({
    adapter: target.adapter,
    mode: target.mode,
    seed,
    timeoutMs: Number(opt.timeout),
    namespacePrefix: prefix,
    ...(opt.budget ? { budget: Number(opt.budget) } : {}),
    ...(opt.policy ? { policy: Policy.parse(opt.policy) } : {}),
    onRun: (r) => {
      namespaces.push(r.namespace);
      out(`  ${r.verdict.result.padEnd(22)} ${r.order.join(' → ')}`);
    },
  });
  if (result.minimal) namespaces.push(result.minimal.namespace);
  if (!opt.keep) for (const ns of new Set(namespaces)) await target.adapter.resetNamespace(ns, { timeoutMs: 3000 }).catch(() => undefined);

  out(`\n${result.explored.length} de ${result.totalOrders} ordens executadas · ${result.violations.length} com violação · ${result.inconclusive.length} inconclusivas`);
  if (result.minimal) {
    out(`\nmenor sequência que ainda reproduz o bug: ${result.minimal.order.join(' → ')}`);
    for (const s of result.minimal.steps) out(`  ${String(s.seq).padStart(2)}. ${s.title.padEnd(26)} ${describeStep(s, result.minimal.verdict).headline}`);
    out(`  => ${result.minimal.verdict.summary}`);
  } else {
    out('\nnenhuma ordem explorada violou o invariante (vale para estas ordens; não prova correção em geral).');
  }

  const code = result.violations.length ? 1 : result.inconclusive.length ? 2 : 0;
  if (opt.json) {
    const brief = (r: (typeof result.explored)[number]) => ({ order: r.order, result: r.verdict.result, summary: r.verdict.summary });
    console.log(
      JSON.stringify(
        {
          schema: 'residuo.cli.explore/v1',
          target: { label: target.label, adapter: target.adapter.describe() },
          seed,
          totalOrders: result.totalOrders,
          explored: result.explored.map(brief),
          minimal: result.minimal ? { ...brief(result.minimal), steps: result.minimal.steps } : null,
          exitCode: code,
        },
        null,
        2,
      ),
    );
  }
  return code;
}

async function cmdCheck(): Promise<number> {
  if (!opt.config) throw new CliError('informe --config residuo.json');
  const config = await readConfig(opt.config);
  const adapter = new ConfigHttpAdapter(config);
  const d = adapter.describe();
  const rows = SCENARIOS.map((s) => ({ id: s.id, missing: missingRequirements(s, d) }));
  if (opt.json) {
    console.log(JSON.stringify({ schema: 'residuo.cli.check/v1', target: config.name, capabilities: d.capabilities, scenarios: rows }, null, 2));
    return 0;
  }
  out(`${opt.config}: válido (${config.name} v${config.version}, ${config.baseUrl})`);
  out(`capacidades: ${d.capabilities.join(', ')}`);
  out(`pontos de leitura: ${d.points.join(', ')}`);
  for (const r of rows) out(`  ${r.missing.length ? '✗' : '✓'} ${r.id}${r.missing.length ? ` — falta: ${r.missing.join(', ')}` : ''}`);
  return 0;
}

function cmdScenarios(): number {
  const rows = SCENARIOS.map((s) => ({ id: s.id, version: s.version, title: s.title, requires: requiredCapabilities(s) }));
  if (opt.json) console.log(JSON.stringify(rows, null, 2));
  else for (const r of rows) out(`${r.id} v${r.version}\n  ${r.title}\n  requer: ${r.requires.join(', ')}\n`);
  return 0;
}

function cmdSchema(): number {
  console.log(JSON.stringify(z.toJSONSchema(TargetConfig, { io: 'input' }), null, 2));
  return 0;
}

async function main(): Promise<number> {
  const cmd = positionals[0];
  if (opt.help || !cmd) {
    console.log(HELP);
    return opt.help ? 0 : 64;
  }
  switch (cmd) {
    case 'run':
      return cmdRun();
    case 'explore':
      return cmdExplore();
    case 'check':
      return cmdCheck();
    case 'scenarios':
      return cmdScenarios();
    case 'schema':
      return cmdSchema();
    default:
      throw new CliError(`comando desconhecido: ${cmd}\n\n${HELP}`);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    if (err instanceof CliError) {
      console.error(`residuo: ${err.message}`);
      process.exit(err.code);
    }
    console.error(err);
    process.exit(70);
  });

