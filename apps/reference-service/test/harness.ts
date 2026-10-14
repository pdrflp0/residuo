import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Fault, Mode, Policy, ResolvedRunConfig } from '@residuo/contracts';
import { DEFAULT_SEED, executeScenario, getScenario, ReferenceHttpAdapter } from '@residuo/engine';
import { createReferenceApp } from '../src/app';

export const TEST_TARGET_DB =
  process.env.TEST_TARGET_DATABASE_URL ?? 'postgres://residuo:residuo-local-only@localhost:54329/residuo_target_test';

/** Sobe o serviço de referência de verdade (Nest + Postgres) numa porta livre. */
export async function startReferenceService() {
  const app = await createReferenceApp({ databaseUrl: TEST_TARGET_DB, logger: false });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  return { app, url, adapter: new ReferenceHttpAdapter(url), close: () => app.close() };
}

export const newNamespace = (tag = 't') => `rsd-${tag}-${randomUUID().slice(0, 8)}`;

export function config(
  scenarioId: string,
  mode: Mode,
  over: Partial<{ policy: Policy; fault: Fault; seed: number; timeoutMs: number }> = {},
): ResolvedRunConfig {
  const s = getScenario(scenarioId)!;
  return {
    scenarioId,
    scenarioVersion: s.version,
    mode,
    policy: over.policy ?? s.defaultPolicy,
    seed: over.seed ?? DEFAULT_SEED,
    fault: over.fault ?? 'none',
    stepMode: 'auto',
    timeoutMs: over.timeoutMs ?? 3000,
  };
}

export function run(adapter: ReferenceHttpAdapter, cfg: ResolvedRunConfig, namespace = newNamespace()) {
  return executeScenario({ scenario: getScenario(cfg.scenarioId)!, config: cfg, namespace, adapter }).then((r) => ({ ...r, namespace }));
}
