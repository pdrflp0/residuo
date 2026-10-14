import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { ReportV1, RunDetail } from '@residuo/contracts';

test('demo: executa, localiza o reaparecimento, exporta e compara com o modo protegido', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Rodar a demonstração' }).click();
  await expect(page).toHaveURL(/#\/runs\/run_[a-f0-9]{10}$/);
  const runId = page.url().split('/').pop()!;

  // o veredito exibido vem da API
  const verdict = page.getByRole('region', { name: 'Veredito da execução' });
  await expect(verdict).toContainText('Violação: o registro excluído voltou');
  const api = (await (await request.get(`http://127.0.0.1:4010/api/runs/${runId}`)).json()) as RunDetail;
  expect(api.run.verdict?.result).toBe('VIOLATION');
  await expect(verdict).toContainText(api.run.verdict!.summary);

  // abrir a evidência do reaparecimento
  await page.getByRole('button', { name: /Ver o reaparecimento \(etapa 9\)/ }).click();
  const evidence = page.getByRole('region', { name: 'Evidência da etapa 9' });
  await expect(evidence).toContainText('Ler estado final');
  await expect(evidence).toContainText('Violação de “a geração excluída não volta”');
  await expect(evidence).toContainText('"generation": 1');
  await expect(page.getByRole('button', { name: /^Etapa 9: Ler estado final/ })).toHaveAttribute('aria-pressed', 'true');

  // ir para a causa
  await evidence.getByRole('button', { name: /ir para a causa \(etapa 8\)/ }).click();
  await expect(page.getByRole('region', { name: 'Evidência da etapa 8' })).toContainText('UPSERT_INSERTED');

  // exportar JSON e Markdown: o conteúdo bate com a API
  const [jsonDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Relatório JSON' }).click()]);
  const report = JSON.parse(await readFile((await jsonDl.path())!, 'utf8')) as ReportV1;
  expect(report.schema).toBe('residuo.report/v1');
  expect(report.verdict).toEqual(api.run.verdict);
  expect(report.steps).toEqual(api.steps);
  const [mdDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Relatório Markdown' }).click()]);
  const md = await readFile((await mdDl.path())!, 'utf8');
  expect(md).toContain('**Resultado:** VIOLATION');
  expect(md).toContain(runId);

  // repetir no modo protegido e comparar
  await page.getByRole('button', { name: 'Repetir em guarded e comparar' }).click();
  await expect(page).toHaveURL(new RegExp(`#/compare/${runId}/run_[a-f0-9]{10}$`));
  await expect(page.getByText('O resultado mudou de VIOLATION para NO_VIOLATION_OBSERVED')).toBeVisible();
  await expect(page.getByRole('region', { name: /^B · guarded/ })).toContainText('REJECTED_DELETED');
  await expect(page.getByRole('region', { name: /^A · vulnerable/ })).toContainText('UPSERT_INSERTED');
});

test.describe('acessibilidade', () => {
  test.use({ reducedMotion: 'reduce' });

  test('teclado e movimento reduzido: tudo aparece de uma vez e a seleção anda com as setas', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Animações')).not.toBeChecked();

    // iniciar a demo só pelo teclado
    const demo = page.getByRole('button', { name: 'Rodar a demonstração' });
    await demo.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/runs\//);
    await expect(page.getByRole('region', { name: 'Veredito da execução' })).toBeVisible();

    // sem animação: as 9 etapas já estão visíveis
    await expect(page.locator('.playbar .counter')).toHaveText('9/9');
    const node9 = page.getByRole('button', { name: /^Etapa 9:/ });
    await expect(node9).toHaveAttribute('aria-pressed', 'true');

    // roving tabindex: setas movem a seleção e o foco
    await node9.focus();
    await page.keyboard.press('ArrowLeft');
    const node8 = page.getByRole('button', { name: /^Etapa 8:/ });
    await expect(node8).toBeFocused();
    await expect(node8).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: 'Evidência da etapa 8' })).toBeVisible();
    await page.keyboard.press('Home');
    await expect(page.getByRole('button', { name: /^Etapa 1:/ })).toBeFocused();

    // nenhuma animação CSS ativa nos nós
    const animated = await page.locator('.node').evaluateAll((els) => els.filter((e) => getComputedStyle(e).animationName !== 'none').length);
    expect(animated).toBe(0);
  });
});
