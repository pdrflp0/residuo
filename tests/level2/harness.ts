import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { type ResolvedRunConfig, type TargetAdapter, TargetConfig, type TargetMode } from '@residuo/contracts';
import { DEFAULT_SEED, executeScenario, getScenario } from '@residuo/engine';
import { createNotesServer } from '@residuo/example-notes-sync';
import { createReferenceApp } from '@residuo/reference-service';

const DB = 'postgres://residuo:residuo-local-only@localhost:54329';
export const root = fileURLToPath(new URL('../../', import.meta.url));

export function loadConfig(relPath: string, baseUrl: string): TargetConfig {
  const raw = JSON.parse(readFileSync(root + relPath, 'utf8'));
  return TargetConfig.parse({ ...raw, baseUrl });
}

export async function startNotes() {
  const notes = await createNotesServer({ databaseUrl: `${DB}/residuo_example_notes_test`, hooks: true });
  await new Promise<void>((r) => notes.server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(notes.server.address() as AddressInfo).port}`;
  return { url, close: notes.close };
}

export async function startReference() {
  const app = await createReferenceApp({ databaseUrl: `${DB}/residuo_target_test`, logger: false });
  await app.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  return { url, close: () => app.close() };
}

export const ns = (tag = 'l2') => `rsd-${tag}-${randomUUID().slice(0, 8)}`;

export function runScenario(adapter: TargetAdapter, scenarioId: string, mode: TargetMode, over: Partial<ResolvedRunConfig> = {}) {
  const scenario = getScenario(scenarioId)!;
  return executeScenario({
    scenario,
    namespace: ns(),
    adapter,
    config: {
      scenarioId,
      scenarioVersion: scenario.version,
      mode,
      policy: scenario.defaultPolicy,
      seed: DEFAULT_SEED,
      fault: 'none',
      stepMode: 'auto',
      timeoutMs: 3000,
      ...over,
    },
  });
}
