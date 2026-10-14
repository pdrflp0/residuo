/**
 * Executa um cenário sem interface, direto contra o serviço de referência.
 *
 *   npm run lab -- --scenario held-update-after-delete --mode vulnerable
 *
 * Código de saída: 0 = sem violação / permitido pela política, 1 = VIOLATION, 2 = INCONCLUSIVE.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Fault, Mode, Policy, type ResolvedRunConfig } from '@residuo/contracts';
import { DEFAULT_SEED, describeStep, executeScenario, getScenario, ReferenceHttpAdapter, SCENARIOS } from '@residuo/engine';

const { values } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'held-update-after-delete' },
    mode: { type: 'string', default: 'vulnerable' },
    policy: { type: 'string' },
    seed: { type: 'string', default: String(DEFAULT_SEED) },
    fault: { type: 'string', default: 'none' },
    timeout: { type: 'string', default: '3000' },
    keep: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
});

const scenario = getScenario(values.scenario!);
if (!scenario) {
  console.error(`Cenário desconhecido. Disponíveis: ${SCENARIOS.map((s) => s.id).join(', ')}`);
  process.exit(64);
}

const config: ResolvedRunConfig = {
  scenarioId: scenario.id,
  scenarioVersion: scenario.version,
  mode: Mode.parse(values.mode),
  policy: Policy.parse(values.policy ?? scenario.defaultPolicy),
  seed: Number(values.seed),
  fault: Fault.parse(values.fault),
  stepMode: 'auto',
  timeoutMs: Number(values.timeout),
};

const baseUrl = process.env.REFERENCE_SERVICE_URL ?? 'http://localhost:4100';
const adapter = new ReferenceHttpAdapter(baseUrl);
const namespace = `rsd-cli-${randomUUID().slice(0, 8)}`;

const result = await executeScenario({ scenario, config, namespace, adapter });
if (!values.keep) await adapter.resetNamespace(namespace, { timeoutMs: 3000 }).catch(() => undefined);

if (values.json) {
  console.log(JSON.stringify({ config, namespace, ...result }, null, 2));
} else {
  console.log(`\n${scenario.title}  [${scenario.id} v${scenario.version}]`);
  console.log(`modo=${config.mode} política=${config.policy} semente=${config.seed} falha=${config.fault} registro=${result.entityId}\n`);
  for (const s of result.steps) {
    const n = describeStep(s, result.verdict);
    const code = s.exchange?.response?.status ?? '---';
    console.log(`${String(s.seq).padStart(2)}. ${s.lane.padEnd(9)} ${s.title.padEnd(30)} ${String(code).padEnd(4)} ${n.headline}`);
  }
  console.log(`\n=> ${result.verdict.result}\n   ${result.verdict.summary}\n`);
}

process.exit(result.verdict.result === 'VIOLATION' ? 1 : result.verdict.result === 'INCONCLUSIVE' ? 2 : 0);
