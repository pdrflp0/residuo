/**
 * Coordena execuções: cria o registro da Run, executa o engine em segundo plano,
 * persiste cada observação assim que ela acontece e, no modo manual, segura a
 * próxima etapa numa barreira até o usuário avançar.
 */
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { type Mode, type ResolvedRunConfig, type Run, RunConfig, type RunDetail, type TargetAdapter, type Verdict } from '@residuo/contracts';
import { DEFAULT_SEED, ENGINE_VERSION, evaluate, executeScenario, getScenario, summarizeScenario, syntheticData } from '@residuo/engine';
import { LabStore } from './lab-store';

export const TARGET_ADAPTER = Symbol('TARGET_ADAPTER');

/** Tempo máximo que uma execução manual espera o usuário avançar. */
const MANUAL_GATE_TIMEOUT_MS = 15 * 60_000;

interface Gate {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

@Injectable()
export class RunExecutor implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly log = new Logger('RunExecutor');
  private readonly gates = new Map<string, Gate>();
  private readonly active = new Map<string, Promise<void>>();
  private shuttingDown = false;
  private readonly abandoned = new Set<string>();

  constructor(
    @Inject(LabStore) private readonly store: LabStore,
    @Inject(TARGET_ADAPTER) private readonly adapter: TargetAdapter,
  ) {}

  /** Execuções que estavam em andamento quando o processo caiu não viram aprovação. */
  async onApplicationBootstrap() {
    for (const run of await this.store.unfinishedRuns()) {
      const steps = await this.store.getSteps(run.id);
      await this.store.complete(run.id, 'interrupted', interruptedVerdict(run, steps));
    }
  }

  /** Antes de fechar o pool: libera barreiras e espera as execuções gravarem o estado final. */
  async beforeApplicationShutdown() {
    this.shuttingDown = true;
    for (const [id, gate] of this.gates) {
      clearTimeout(gate.timer);
      gate.reject(new Error('servidor encerrado'));
      this.gates.delete(id);
    }
    await Promise.allSettled(this.active.values());
  }

  async start(input: unknown, replayOf?: string): Promise<Run> {
    const parsed = RunConfig.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ message: 'configuração inválida', issues: parsed.error.issues });
    const scenario = getScenario(parsed.data.scenarioId);
    if (!scenario) throw new NotFoundException({ message: `cenário desconhecido: ${parsed.data.scenarioId}` });

    const config: ResolvedRunConfig = {
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      mode: parsed.data.mode,
      policy: parsed.data.policy ?? scenario.defaultPolicy,
      seed: parsed.data.seed ?? DEFAULT_SEED,
      fault: parsed.data.fault,
      stepMode: parsed.data.stepMode,
      timeoutMs: parsed.data.timeoutMs,
    };
    const id = `run_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const run: Run = {
      id,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      engineVersion: ENGINE_VERSION,
      adapter: this.adapter.describe(),
      config,
      namespace: `rsd-${id.replace('_', '-')}`,
      entityId: syntheticData(config.seed).entityId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      ...(replayOf ? { replayOf } : {}),
    };
    await this.store.insertRun(run);

    const job = this.execute(run).finally(() => this.active.delete(id));
    this.active.set(id, job);
    return run;
  }

  /** Mesma configuração (inclusive versão do cenário e semente); exige que a versão ainda exista. */
  async replay(id: string, overrides: { mode?: Mode } = {}): Promise<Run> {
    const original = await this.require(id);
    const scenario = getScenario(original.scenarioId);
    if (!scenario || scenario.version !== original.scenarioVersion) {
      throw new ConflictException({
        message: `o cenário ${original.scenarioId} v${original.scenarioVersion} não está mais disponível neste engine (atual: v${scenario?.version ?? '—'})`,
      });
    }
    const { scenarioVersion: _v, ...config } = original.config;
    return this.start({ ...config, ...overrides, stepMode: overrides.mode ? 'auto' : config.stepMode }, overrides.mode ? undefined : original.id);
  }

  async advance(id: string): Promise<{ advanced: boolean }> {
    const gate = this.gates.get(id);
    if (!gate) {
      await this.require(id);
      throw new ConflictException({ message: 'a execução não está aguardando avanço' });
    }
    this.gates.delete(id);
    clearTimeout(gate.timer);
    gate.resolve();
    return { advanced: true };
  }

  async detail(id: string): Promise<RunDetail> {
    const run = await this.require(id);
    const scenario = getScenario(run.scenarioId);
    const [steps, aiSummary] = await Promise.all([this.store.getSteps(id), this.store.getAiSummary(id)]);
    return {
      run,
      steps,
      scenario: scenario && scenario.version === run.scenarioVersion ? summarizeScenario(scenario) : fallbackScenario(run, steps),
      ...(aiSummary ? { aiSummary } : {}),
    };
  }

  async resetTarget(id: string): Promise<{ namespace: string }> {
    const run = await this.require(id);
    if (this.active.has(id)) throw new ConflictException({ message: 'execução em andamento' });
    await this.adapter.resetNamespace(run.namespace, { timeoutMs: 3000 });
    return { namespace: run.namespace };
  }

  /** Para testes e encerramento: aguarda a execução terminar. */
  async settled(id: string): Promise<void> {
    await this.active.get(id);
  }

  private async require(id: string): Promise<Run> {
    const run = await this.store.getRun(id);
    if (!run) throw new NotFoundException({ message: `execução não encontrada: ${id}` });
    return run;
  }

  private async execute(run: Run): Promise<void> {
    const scenario = getScenario(run.scenarioId)!;
    try {
      await this.store.setStatus(run.id, 'running');
      const result = await executeScenario({
        scenario,
        config: run.config,
        namespace: run.namespace,
        adapter: this.adapter,
        onStep: (obs) => this.store.insertStep(run.id, obs),
        ...(run.config.stepMode === 'manual' ? { beforeStep: (step) => this.waitForAdvance(run.id, step.id) } : {}),
      });
      const cutShort = (this.shuttingDown || this.abandoned.has(run.id)) && result.steps.some((s) => s.status === 'skipped');
      if (cutShort) {
        await this.store.complete(run.id, 'interrupted', interruptedVerdict(run, result.steps));
      } else {
        await this.store.complete(run.id, 'completed', result.verdict);
      }
    } catch (err) {
      this.log.error(`execução ${run.id} interrompida: ${(err as Error).message}`);
      const steps = await this.store.getSteps(run.id).catch(() => []);
      await this.store.complete(run.id, 'interrupted', interruptedVerdict(run, steps)).catch(() => undefined);
    } finally {
      this.abandoned.delete(run.id);
    }
  }

  private async waitForAdvance(runId: string, stepId: string): Promise<void> {
    if (this.shuttingDown) throw new Error('servidor encerrando');
    // A barreira é registrada antes de anunciar "paused": um avanço imediato nunca encontra a execução sem barreira.
    const gate = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.gates.delete(runId);
        this.abandoned.add(runId);
        reject(new Error('execução manual abandonada (sem avanço por 15 min)'));
      }, MANUAL_GATE_TIMEOUT_MS);
      this.gates.set(runId, { resolve, reject, timer });
    });
    gate.catch(() => undefined); // rejeição tratada no await abaixo; evita aviso se ocorrer durante o setStatus
    await this.store.setStatus(runId, 'paused', stepId);
    await gate;
    await this.store.setStatus(runId, 'running', stepId);
  }
}

function interruptedVerdict(run: Run, steps: Parameters<typeof evaluate>[0]['steps']): Verdict {
  const partial = evaluate({ policy: run.config.policy, steps });
  const reason = 'A execução foi interrompida antes de terminar (processo reiniciado ou erro interno).';
  if (partial.result === 'VIOLATION') return { ...partial, inconclusiveReasons: [...partial.inconclusiveReasons, reason] };
  return {
    ...partial,
    result: 'INCONCLUSIVE',
    summary: `Resultado inconclusivo: ${reason}`,
    allowances: [],
    inconclusiveReasons: [reason, ...partial.inconclusiveReasons],
  };
}

function fallbackScenario(run: Run, steps: RunDetail['steps']): RunDetail['scenario'] {
  return {
    id: run.scenarioId,
    version: run.scenarioVersion,
    title: `${run.scenarioId} v${run.scenarioVersion} (versão antiga)`,
    summary: 'Esta versão do cenário não está mais disponível no engine; exibindo as etapas gravadas.',
    defaultPolicy: run.config.policy,
    story: [],
    steps: steps.map((s) => ({ id: s.stepId, kind: s.kind, lane: s.lane, title: s.title, plain: '' })),
  };
}
