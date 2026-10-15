import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { AiSummary, Run, RunStatus, StepObservation, Verdict } from '@residuo/contracts';
import type pg from 'pg';
import { inTransaction } from './db';

export const LAB_POOL = Symbol('LAB_POOL');

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

function toRun(r: any): Run {
  return {
    id: r.id,
    scenarioId: r.scenario_id,
    scenarioVersion: r.scenario_version,
    engineVersion: r.engine_version,
    adapter: r.adapter,
    config: r.config,
    namespace: r.namespace,
    entityId: r.entity_id,
    status: r.status,
    createdAt: iso(r.created_at)!,
    ...(r.replay_of ? { replayOf: r.replay_of } : {}),
    ...(r.next_step_id ? { nextStepId: r.next_step_id } : {}),
    ...(r.started_at ? { startedAt: iso(r.started_at) } : {}),
    ...(r.finished_at ? { finishedAt: iso(r.finished_at) } : {}),
    ...(r.verdict ? { verdict: r.verdict } : {}),
  };
}

function toStep(r: any): StepObservation {
  return {
    seq: r.seq,
    stepId: r.step_id,
    kind: r.kind,
    lane: r.lane,
    title: r.title,
    status: r.status,
    startedAt: iso(r.started_at)!,
    finishedAt: iso(r.finished_at)!,
    facts: r.facts,
    ...(r.exchange ? { exchange: r.exchange } : {}),
    ...(r.error ? { error: r.error } : {}),
  };
}

@Injectable()
export class LabStore implements OnApplicationShutdown {
  constructor(@Inject(LAB_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }

  async insertRun(run: Run): Promise<void> {
    await this.pool.query(
      `INSERT INTO runs (id, scenario_id, scenario_version, engine_version, adapter, config, namespace, entity_id, status, replay_of, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [run.id, run.scenarioId, run.scenarioVersion, run.engineVersion, run.adapter, run.config, run.namespace, run.entityId, run.status, run.replayOf ?? null, run.createdAt],
    );
  }

  async setStatus(id: string, status: RunStatus, nextStepId: string | null = null): Promise<void> {
    await this.pool.query(
      `UPDATE runs SET status = $2, next_step_id = $3, started_at = COALESCE(started_at, now()) WHERE id = $1`,
      [id, status, nextStepId],
    );
  }

  async insertStep(runId: string, s: StepObservation): Promise<void> {
    await this.pool.query(
      `INSERT INTO step_observations (run_id, seq, step_id, kind, lane, title, status, started_at, finished_at, exchange, facts, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [runId, s.seq, s.stepId, s.kind, s.lane, s.title, s.status, s.startedAt, s.finishedAt, s.exchange ?? null, s.facts, s.error ?? null],
    );
  }

  async complete(id: string, status: RunStatus, verdict: Verdict): Promise<void> {
    await inTransaction(this.pool, async (tx) => {
      await tx.query(`UPDATE runs SET status = $2, verdict = $3, next_step_id = NULL, finished_at = now() WHERE id = $1`, [id, status, verdict]);
      await tx.query(`DELETE FROM violations WHERE run_id = $1`, [id]);
      for (const [idx, v] of verdict.violations.entries()) {
        await tx.query(
          `INSERT INTO violations (run_id, idx, invariant, entity_id, generation, observed_at_seq, caused_by_seq, attribution, explanation, evidence_seqs)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [id, idx, v.invariant, v.entityId, v.generation, v.observedAtSeq, v.causedBySeq ?? null, v.attribution, v.explanation, v.evidenceSeqs],
        );
      }
    });
  }

  async getRun(id: string): Promise<Run | undefined> {
    const { rows } = await this.pool.query(`SELECT * FROM runs WHERE id = $1`, [id]);
    return rows[0] ? toRun(rows[0]) : undefined;
  }

  async getSteps(runId: string): Promise<StepObservation[]> {
    const { rows } = await this.pool.query(`SELECT * FROM step_observations WHERE run_id = $1 ORDER BY seq`, [runId]);
    return rows.map(toStep);
  }

  async getAiSummary(runId: string): Promise<AiSummary | undefined> {
    const { rows } = await this.pool.query(`SELECT summary FROM ai_summaries WHERE run_id = $1`, [runId]);
    return rows[0]?.summary;
  }

  /** Um resumo por execução; gerar de novo substitui o anterior. */
  async saveAiSummary(s: AiSummary): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_summaries (run_id, model, summary, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (run_id) DO UPDATE SET model = EXCLUDED.model, summary = EXCLUDED.summary, created_at = EXCLUDED.created_at`,
      [s.runId, s.model, s, s.createdAt],
    );
  }

  async listRuns(limit: number): Promise<Run[]> {
    const { rows } = await this.pool.query(`SELECT * FROM runs ORDER BY created_at DESC LIMIT $1`, [limit]);
    return rows.map(toRun);
  }

  async unfinishedRuns(): Promise<Run[]> {
    const { rows } = await this.pool.query(`SELECT * FROM runs WHERE status IN ('queued', 'running', 'paused')`);
    return rows.map(toRun);
  }
}
