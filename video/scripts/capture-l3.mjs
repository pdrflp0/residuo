/**
 * Capturas REAIS para o vídeo do nível 3. Precisa do ambiente de desenvolvimento no ar
 * (npm run db:up && npm run dev, na raiz). Cria execuções de verdade (backup restaurado e
 * cache/busca, nos dois modos), abre o relatório HTML exportado e roda a CLI `explore`
 * com 3 clientes contra o serviço de referência. Salva imagens em 2x, a geometria dos
 * elementos e a saída da CLI em public/shots/l3/.
 *
 *   npm run capture:l3
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';

const BASE = process.env.RESIDUO_URL ?? 'http://127.0.0.1:5173';
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('../public/shots/l3/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

async function api(path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}
async function finished(id) {
  for (let i = 0; i < 100; i++) {
    const d = await api(`/runs/${id}`);
    if (d.run.status === 'completed') return d;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`execução ${id} não terminou`);
}
async function pair(scenarioId) {
  const v = await api('/runs', { scenarioId, mode: 'vulnerable' });
  const vd = await finished(v.id);
  const g = await api(`/runs/${v.id}/counterpart`, { mode: 'guarded' });
  const gd = await finished(g.id);
  console.log(scenarioId, v.id, vd.run.verdict.result, '→', g.id, gd.run.verdict.result);
  return { v: vd, g: gd };
}

const backup = await pair('backup-restore-after-delete');
const derived = await pair('derived-data-after-delete');
const geometry = {
  backup: { runId: backup.v.run.id, guardedId: backup.g.run.id, steps: backup.v.steps.length, verdict: backup.v.run.verdict, guardedVerdict: backup.g.run.verdict },
  derived: { runId: derived.v.run.id, guardedId: derived.g.run.id, steps: derived.v.steps.length, verdict: derived.v.run.verdict, guardedVerdict: derived.g.run.verdict },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1700 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });

/** Bancada (cartões + linha do tempo) no estado final, com a posição de cada etapa. */
async function bench(name, d) {
  const n = d.steps.length;
  await page.goto(`${BASE}/#/runs/${d.run.id}`);
  const verdict = page.getByRole('region', { name: 'Veredito da execução' });
  await verdict.waitFor();
  await page.locator('.playbar .counter').getByText(`${n}/${n}`).waitFor();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  const entities = page.locator('.entities');
  const timeline = page.getByRole('region', { name: 'Linha do tempo' });
  const a = await entities.boundingBox();
  const b = await timeline.boundingBox();
  const clip = { x: a.x - 2, y: a.y - 2, width: Math.max(a.width, b.width) + 4, height: b.y + b.height - a.y + 4 };
  await page.screenshot({ path: `${OUT}${name}-bench.png`, clip });
  const rel = async (loc) => {
    const r = await loc.boundingBox();
    return r && { x: r.x - clip.x, y: r.y - clip.y, w: r.width, h: r.height };
  };
  const nodes = {};
  for (let k = 1; k <= n; k++) nodes[k] = await rel(page.getByRole('button', { name: new RegExp(`^Etapa ${k}:`) }));
  const watched = page.locator('.tl-watched');
  geometry[name].bench = { w: clip.width, h: clip.height, nodes, watched: (await watched.count()) ? await rel(watched) : null };
}

async function compare(name, d) {
  await page.goto(`${BASE}/#/compare/${d.v.run.id}/${d.g.run.id}`);
  await page.getByText('O resultado mudou').waitFor();
  await page.waitForTimeout(200);
  await page.mouse.move(0, 0);
  await page.locator('.compare-head').screenshot({ path: `${OUT}${name}-compare-head.png` });
}

await bench('backup', backup.v);
await bench('derived', derived.v);
await compare('backup', backup);
await compare('derived', derived);
geometry.backup.seqs = Object.fromEntries(backup.v.steps.map((s) => [s.stepId, s.seq]));
geometry.derived.seqs = Object.fromEntries(derived.v.steps.map((s) => [s.stepId, s.seq]));
// fatos das execuções protegidas: o vídeo só afirma o que está aqui
const facts = (d) =>
  Object.fromEntries(
    d.steps.map((s) => [
      s.stepId,
      { seq: s.seq, status: s.status, writeOutcome: s.facts.writeOutcome ?? null, reappliedDeletions: s.facts.reappliedDeletions ?? null, visible: s.facts.visible ?? null, point: s.facts.observationPoint ?? null },
    ]),
  );
geometry.backup.guardedFacts = facts(backup.g);
geometry.derived.guardedFacts = facts(derived.g);

// ---------- relatório HTML exportado, aberto como arquivo ----------
const html = await (await fetch(`${BASE}/api/runs/${backup.v.run.id}/report.html`)).text();
// fora de public/: o vídeo usa só a captura; o arquivo em si é descartável
const reportFile = join(await mkdtemp(join(tmpdir(), 'residuo-l3-')), `residuo-${backup.v.run.id}.html`);
await writeFile(reportFile, html);
await page.setViewportSize({ width: 1440, height: 1000 });
const report = await browser.newPage({ viewport: { width: 1440, height: 1500 }, deviceScaleFactor: 2 });
const external = [];
report.on('request', (r) => {
  if (!r.url().startsWith('file://')) external.push(r.url());
});
await report.goto(`file://${reportFile}`);
await report.locator('#verdict h2').waitFor();
await report.mouse.move(0, 0);
await report.screenshot({ path: `${OUT}report.png` });
geometry.report = { file: `residuo-${backup.v.run.id}.html`, externalRequests: external.length, w: 1440, h: 1500 };
await report.close();
await browser.close();

// ---------- CLI: explore com 3 clientes contra o serviço de referência (vulnerable) ----------
const run = promisify(execFile);
let stdout = '';
let code = 0;
try {
  ({ stdout } = await run('node', [`${ROOT}packages/cli/bin/residuo.mjs`, 'explore', '--reference', '--clients', '3'], { cwd: ROOT, timeout: 120_000 }));
} catch (err) {
  stdout = err.stdout;
  code = err.code;
}
geometry.explore = { command: 'npm run residuo -- explore --reference --clients 3', exitCode: code, output: stdout.replace(/\n+$/, '').split('\n') };

await writeFile(`${OUT}geometry.json`, JSON.stringify(geometry, null, 2));
console.log('capturas salvas em', OUT, '· relatório sem requisições externas:', external.length === 0, '· explore saiu com', code);
