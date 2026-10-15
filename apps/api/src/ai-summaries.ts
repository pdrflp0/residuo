import { BadGatewayException, ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AiSummary } from '@residuo/contracts';
import { AiServiceError, AiSummaryRejected, buildReport, DEFAULT_AI_MODEL, summarizeReport } from '@residuo/engine';
import { LabStore } from './lab-store';
import { RunExecutor } from './run-executor';

export const AI_CONFIG = Symbol('AI_CONFIG');

/** Resumo com IA é opcional: sem chave, a API responde 503 e a interface mostra como ligar. */
export interface AiConfig {
  apiKey?: string;
  model?: string;
  /** só por configuração explícita (RESIDUO_AI_BASE_URL) */
  baseURL?: string;
  fetch?: typeof fetch;
}

@Injectable()
export class AiSummaries {
  /** pedidos simultâneos para a mesma execução compartilham uma única chamada ao modelo */
  private readonly inflight = new Map<string, Promise<AiSummary>>();

  constructor(
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    @Inject(RunExecutor) private readonly executor: RunExecutor,
    @Inject(LabStore) private readonly store: LabStore,
  ) {}

  status() {
    return { enabled: Boolean(this.config.apiKey), model: this.config.model ?? DEFAULT_AI_MODEL };
  }

  async generate(runId: string, refresh = false): Promise<AiSummary> {
    const apiKey = this.config.apiKey;
    if (!apiKey) throw new ServiceUnavailableException({ message: 'Resumo com IA desligado. Para ligar, inicie a API com ANTHROPIC_API_KEY definida.' });
    // registrado antes de ler o banco: um segundo pedido nunca lê um estado anterior ao que o primeiro vai gravar
    const pending = this.inflight.get(runId);
    if (pending) return pending;
    const job = this.summarize(runId, apiKey, refresh).finally(() => this.inflight.delete(runId));
    this.inflight.set(runId, job);
    return job;
  }

  private async summarize(runId: string, apiKey: string, refresh: boolean): Promise<AiSummary> {
    const detail = await this.executor.detail(runId);
    if (!detail.run.verdict) throw new ConflictException({ message: 'a execução ainda não tem veredito' });
    if (detail.aiSummary && !refresh) return detail.aiSummary;
    try {
      const summary = await summarizeReport(buildReport(detail), {
        apiKey,
        ...(this.config.model ? { model: this.config.model } : {}),
        ...(this.config.baseURL ? { baseURL: this.config.baseURL } : {}),
        ...(this.config.fetch ? { fetch: this.config.fetch } : {}),
      });
      await this.store.saveAiSummary(summary);
      return summary;
    } catch (err) {
      if (err instanceof AiSummaryRejected) throw new BadGatewayException({ message: err.message, problems: err.problems });
      if (err instanceof AiServiceError) throw new BadGatewayException({ message: err.message });
      throw err;
    }
  }
}
