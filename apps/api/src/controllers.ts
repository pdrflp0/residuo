import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { Mode, type TargetAdapter } from '@residuo/contracts';
import { buildReport, compareRuns, DEFAULT_SEED, ENGINE_VERSION, regressionTest, renderMarkdown, SCENARIOS, summarizeScenario } from '@residuo/engine';
import type { Response } from 'express';
import { z } from 'zod';
import { LabStore } from './lab-store';
import { RunExecutor, TARGET_ADAPTER } from './run-executor';

export const REFERENCE_URL = Symbol('REFERENCE_URL');

const RunId = z.string().regex(/^run_[a-f0-9]{10}$/);
const runId = (raw: string) => {
  const r = RunId.safeParse(raw);
  if (!r.success) throw new BadRequestException({ message: 'id de execução inválido' });
  return r.data;
};

@Controller()
export class MetaController {
  constructor(
    @Inject(TARGET_ADAPTER) private readonly adapter: TargetAdapter,
    @Inject(REFERENCE_URL) private readonly referenceUrl: string,
  ) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('about')
  async about() {
    let reference: unknown = { reachable: false };
    try {
      const res = await fetch(`${this.referenceUrl}/about`, { signal: AbortSignal.timeout(1500) });
      reference = { reachable: res.ok, ...(res.ok ? ((await res.json()) as object) : {}) };
    } catch {
      /* alvo fora do ar: a interface mostra o aviso */
    }
    return { engineVersion: ENGINE_VERSION, adapter: this.adapter.describe(), reference };
  }

  @Get('scenarios')
  scenarios() {
    return { defaultSeed: DEFAULT_SEED, scenarios: SCENARIOS.map(summarizeScenario) };
  }
}

@Controller('runs')
export class RunsController {
  constructor(
    @Inject(RunExecutor) private readonly executor: RunExecutor,
    @Inject(LabStore) private readonly store: LabStore,
  ) {}

  @Post()
  @HttpCode(202)
  create(@Body() body: unknown) {
    return this.executor.start(body);
  }

  @Get()
  list(@Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return this.store.listRuns(n);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.executor.detail(runId(id));
  }

  @Post(':id/advance')
  @HttpCode(200)
  advance(@Param('id') id: string) {
    return this.executor.advance(runId(id));
  }

  /** Reexecuta exatamente a mesma configuração (cenário, versão, semente, modo, política, falha). */
  @Post(':id/replay')
  @HttpCode(202)
  replay(@Param('id') id: string) {
    return this.executor.replay(runId(id));
  }

  /** Mesma configuração com o outro modo do alvo — base da comparação vulnerable × guarded. */
  @Post(':id/counterpart')
  @HttpCode(202)
  counterpart(@Param('id') id: string, @Body() body: unknown) {
    const mode = Mode.safeParse((body as { mode?: unknown } | undefined)?.mode);
    if (!mode.success) throw new BadRequestException({ message: 'informe mode: vulnerable | guarded' });
    return this.executor.replay(runId(id), { mode: mode.data });
  }

  @Get(':id/report.json')
  async reportJson(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const report = buildReport(await this.executor.detail(runId(id)));
    res.setHeader('content-disposition', `attachment; filename="residuo-${id}.json"`);
    return report;
  }

  @Get(':id/report.md')
  async reportMd(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const report = buildReport(await this.executor.detail(runId(id)));
    res.setHeader('content-type', 'text/markdown; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="residuo-${id}.md"`);
    return renderMarkdown(report);
  }

  @Get(':id/regression.test.ts')
  async regression(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const report = buildReport(await this.executor.detail(runId(id)));
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="residuo-${id}.regression.test.ts"`);
    return regressionTest(report);
  }

  /** Reset restrito ao namespace desta execução no serviço de referência. */
  @Delete(':id/target-data')
  resetTarget(@Param('id') id: string) {
    return this.executor.resetTarget(runId(id));
  }
}

@Controller('comparisons')
export class ComparisonsController {
  constructor(@Inject(RunExecutor) private readonly executor: RunExecutor) {}

  @Get()
  async compare(@Query('base') base: string, @Query('candidate') candidate: string) {
    const [a, b] = await Promise.all([this.executor.detail(runId(base)), this.executor.detail(runId(candidate))]);
    return { comparison: compareRuns(a, b), base: a, candidate: b };
  }
}
