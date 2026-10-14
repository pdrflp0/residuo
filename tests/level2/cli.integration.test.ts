/**
 * A CLI como processo real (é assim que ela roda no CI de quem integra).
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { root, startNotes } from './harness';

const pexec = promisify(execFile);
let notes: Awaited<ReturnType<typeof startNotes>>;
let dir = '';
let configPath = '';

beforeAll(async () => {
  notes = await startNotes();
  dir = await mkdtemp(join(tmpdir(), 'residuo-cli-'));
  const raw = JSON.parse(await readFile(join(root, 'examples/notes-sync/residuo.json'), 'utf8'));
  configPath = join(dir, 'residuo.json');
  await writeFile(configPath, JSON.stringify({ ...raw, baseUrl: notes.url }));
});
afterAll(async () => {
  await notes?.close();
});

async function cli(...args: string[]) {
  try {
    const { stdout, stderr } = await pexec('node', [join(root, 'packages/cli/bin/residuo.mjs'), ...args], { cwd: root, timeout: 60_000 });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code: number; stdout: string; stderr: string };
    return { code: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

describe('residuo (CLI)', () => {
  it('run: sai com 1 quando há violação e a saída JSON descreve o resultado', async () => {
    const r = await cli('run', '--config', configPath, '--scenario', 'held-update-after-delete', '--json');
    expect(r.code).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out).toMatchObject({ schema: 'residuo.cli/v1', exitCode: 1 });
    expect(out.results[0].verdict.result).toBe('VIOLATION');
  });

  it('run: sai com 0 na estratégia corrigida, pulando o cenário sem capacidade', async () => {
    const r = await cli('run', '--config', configPath, '--var', 'strategy=tombstone', '--json');
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.skipped).toEqual([
      { scenario: 'authorized-restore', missing: ['restore-entity'] },
      { scenario: 'backup-restore-after-delete', missing: ['snapshot-restore'] },
      { scenario: 'derived-data-after-delete', missing: ['ponto de leitura "cache"', 'ponto de leitura "search"'] },
    ]);
    expect(out.results.map((x: { verdict: { result: string } }) => x.verdict.result)).not.toContain('VIOLATION');
  });

  it('run --report: grava Markdown e JSON reproduzíveis', async () => {
    const reportDir = join(dir, 'relatorios');
    const r = await cli('run', '--config', configPath, '--scenario', 'held-update-after-delete', '--report', reportDir);
    expect(r.code).toBe(1);
    const md = await readFile(join(reportDir, 'held-update-after-delete.md'), 'utf8');
    expect(md).toContain('**Resultado:** VIOLATION');
    expect(md).toContain('residuo.json:notes-sync');
    const html = await readFile(join(reportDir, 'held-update-after-delete.html'), 'utf8');
    expect(html).toContain('"result":"VIOLATION"');
  });

  it('explore: sai com 1 e mostra a menor sequência', async () => {
    const r = await cli('explore', '--config', configPath, '--json');
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout).minimal.order).toEqual(['delete', 'release-1']);
  });

  it('check: lista capacidades e cenários', async () => {
    const r = await cli('check', '--config', configPath, '--json');
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.capabilities).toContain('hold-release-delivery');
    expect(out.scenarios.find((s: { id: string }) => s.id === 'authorized-restore').missing).toEqual(['restore-entity']);
  });

  it('residuo.json inválido sai com 65 e aponta o campo', async () => {
    const bad = join(dir, 'ruim.json');
    await writeFile(bad, JSON.stringify({ name: 'x', baseUrl: 'não é url', operations: {} }));
    const r = await cli('check', '--config', bad);
    expect(r.code).toBe(65);
    expect(r.stderr).toContain('baseUrl');
  });

  it('recusa alvo fora de localhost sem --allow-remote (sem tocar a rede)', async () => {
    const remote = join(dir, 'remoto.json');
    const raw = JSON.parse(await readFile(configPath, 'utf8'));
    await writeFile(remote, JSON.stringify({ ...raw, baseUrl: 'https://producao.example.com' }));
    const r = await cli('run', '--config', remote);
    expect(r.code).toBe(64);
    expect(r.stderr).toContain('--allow-remote');
  });

  it('o JSON Schema publicado está sincronizado com o contrato', async () => {
    const r = await cli('schema');
    const committed = await readFile(join(root, 'schema/residuo.schema.json'), 'utf8');
    expect(JSON.parse(r.stdout)).toEqual(JSON.parse(committed));
  });
});
