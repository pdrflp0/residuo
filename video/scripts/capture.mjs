/**
 * Captura telas REAIS do Resíduo para o vídeo. Precisa do ambiente de desenvolvimento no ar
 * (npm run db:up && npm run dev, na raiz). Cria execuções de verdade pela API, percorre a
 * linha do tempo etapa por etapa e salva imagens em 2x + as posições dos elementos (para
 * as anotações do vídeo apontarem para o lugar certo).
 *
 *   npm run capture
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.RESIDUO_URL ?? 'http://127.0.0.1:5173';
const OUT = new URL('../public/shots/', import.meta.url).pathname;
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

const vuln = await api('/runs', { scenarioId: 'held-update-after-delete', mode: 'vulnerable' });
const vd = await finished(vuln.id);
const guard = await api(`/runs/${vuln.id}/counterpart`, { mode: 'guarded' });
await finished(guard.id);
console.log('execuções', vuln.id, vd.run.verdict.result, guard.id);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const geometry = { runId: vuln.id, guardedId: guard.id };

/** caixa de um elemento relativa a outra (em px CSS) */
async function boxIn(container, inner) {
  const c = await container.boundingBox();
  const b = await inner.boundingBox();
  return { x: b.x - c.x, y: b.y - c.y, w: b.width, h: b.height, cw: c.width, ch: c.height };
}

// ---------- página inicial ----------
await page.goto(`${BASE}/`);
await page.getByText('Execuções recentes').waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}home.png` });
const demoBtn = page.getByRole('button', { name: 'Rodar a demonstração' });
geometry.homeDemoButton = await (async () => {
  const b = await demoBtn.boundingBox();
  return { x: b.x, y: b.y, w: b.width, h: b.height, cw: 1440, ch: 1000 };
})();

// ---------- execução vulnerable, etapa por etapa ----------
await page.setViewportSize({ width: 1440, height: 1700 });
await page.goto(`${BASE}/#/runs/${vuln.id}`);
const verdict = page.getByRole('region', { name: 'Veredito da execução' });
await verdict.waitFor();
await page.locator('.playbar .counter').getByText('9/9').waitFor();

const entities = page.locator('.entities');
const timeline = page.getByRole('region', { name: 'Linha do tempo' });
const prev = page.getByRole('button', { name: 'Etapa anterior' });
const next = page.getByRole('button', { name: 'Próxima etapa' });
for (let i = 0; i < 8; i++) await prev.click();
await page.locator('.playbar .counter').getByText('1/9').waitFor();

async function clipBetween(top, bottom) {
  const a = await top.boundingBox();
  const b = await bottom.boundingBox();
  return { x: a.x - 2, y: a.y - 2, width: Math.max(a.width, b.width) + 4, height: b.y + b.height - a.y + 4 };
}

// A altura da linha do tempo muda conforme as etapas aparecem; a geometria é gravada por etapa.
geometry.steps = {};
for (let k = 1; k <= 9; k++) {
  await page.locator('.playbar .counter').getByText(`${k}/9`).waitFor();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(120);
  const clip = await clipBetween(entities, timeline);
  await page.screenshot({ path: `${OUT}bench-${k}.png`, clip });
  const rel = async (loc) => {
    const b = await loc.boundingBox();
    return b && { x: b.x - clip.x, y: b.y - clip.y, w: b.width, h: b.height };
  };
  const watched = page.locator('.tl-watched');
  geometry.steps[k] = {
    w: clip.width,
    h: clip.height,
    node: await rel(page.getByRole('button', { name: new RegExp(`^Etapa ${k}:`) })),
    watched: (await watched.count()) > 0 ? await rel(watched) : null,
  };
  if (k < 9) await next.click();
}
await page.mouse.move(0, 0);
await verdict.screenshot({ path: `${OUT}verdict-vulnerable.png` });

// evidência da etapa 9 (leitura) e 8 (causa)
const ev = (n) => page.getByRole('region', { name: `Evidência da etapa ${n}` });
await page.getByRole('button', { name: /^Etapa 9:/ }).click();
await ev(9).waitFor();
await page.mouse.move(0, 0);
await ev(9).screenshot({ path: `${OUT}evidence-9.png` });
geometry.evidence9 = {
  violation: await boxIn(ev(9), ev(9).locator('.callout[role="note"]').first()),
  response: await boxIn(ev(9), ev(9).locator('.code-block').nth(1)),
  facts: await boxIn(ev(9), ev(9).locator('.facts')),
};
await page.getByRole('button', { name: /^Etapa 8:/ }).click();
await ev(8).waitFor();
await page.mouse.move(0, 0);
await ev(8).screenshot({ path: `${OUT}evidence-8.png` });
geometry.evidence8 = { response: await boxIn(ev(8), ev(8).locator('.code-block').nth(1)) };

// ---------- comparação ----------
await page.goto(`${BASE}/#/compare/${vuln.id}/${guard.id}`);
await page.getByText('O resultado mudou').waitFor();
await page.waitForTimeout(200);
await page.mouse.move(0, 0);
await page.locator('.compare-head').screenshot({ path: `${OUT}compare-head.png` });
const timelines = page.locator('.compare-timelines');
await timelines.screenshot({ path: `${OUT}compare-timelines.png` });
geometry.compareDiffs = [];
for (const mark of await timelines.locator('.diff-mark').all()) geometry.compareDiffs.push(await boxIn(timelines, mark));
geometry.compareReleaseNodes = [];
for (const node of await timelines.getByRole('button', { name: /^Etapa 8:/ }).all()) geometry.compareReleaseNodes.push(await boxIn(timelines, node));
await page.locator('.evidence-pair').screenshot({ path: `${OUT}compare-evidence.png` });

await writeFile(`${OUT}geometry.json`, JSON.stringify(geometry, null, 2));
await browser.close();
console.log('capturas salvas em', OUT);
