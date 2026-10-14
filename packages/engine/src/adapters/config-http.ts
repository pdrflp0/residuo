/**
 * Adapter genérico: executa as operações descritas num residuo.json contra o sistema de quem
 * está integrando. Traduz respostas em fatos com as regras do arquivo. Não decide veredito.
 */
import {
  AdapterError,
  type AdapterCapability,
  type AdapterDescriptor,
  type AdapterResult,
  type CallOptions,
  type HttpCall,
  type HttpExchange,
  type NamespaceSpec,
  type Operation,
  type StepFacts,
  type TargetAdapter,
  type TargetConfig,
} from '@residuo/contracts';
import { sanitize } from '../sanitize';
import { asNumber, asString, extract, lookup, render, renderPath, TemplateError, type Vars } from './template';

export const CONFIG_ADAPTER_VERSION = '0.2.0';

interface Outcome {
  exchange: HttpExchange;
  body: unknown;
  status: number;
  accepted: boolean;
}

export class ConfigHttpAdapter implements TargetAdapter {
  private readonly baseVars: Vars;

  constructor(
    private readonly config: TargetConfig,
    extraVars: Vars = {},
  ) {
    this.baseVars = { ...config.vars, ...extraVars };
  }

  describe(): AdapterDescriptor {
    const ops = this.config.operations;
    const caps: AdapterCapability[] = ['create-entity', 'delete-entity', 'inspect-entity'];
    if (ops.prepareUpdate) caps.push('prepare-update');
    if (ops.hold && ops.release) caps.push('hold-release-delivery');
    if (ops.redeliver) caps.push('redeliver');
    if (ops.confirmDeletion) caps.push('confirm-deletion');
    if (ops.restore) caps.push('restore-entity');
    if (ops.snapshot && ops.restoreSnapshot) caps.push('snapshot-restore');
    if (Object.keys(ops.inspectPoints).length) caps.push('inspect-derived');
    if (ops.inspect.facts.lastWrittenBy) caps.push('write-provenance');
    if (this.config.isolation.header || this.config.isolation.setup) caps.push('namespace-isolation');
    return {
      name: `residuo.json:${this.config.name}`,
      version: `${this.config.version} (adapter ${CONFIG_ADAPTER_VERSION})`,
      capabilities: caps,
      points: ['primary', ...Object.keys(ops.inspectPoints)],
      observationPoints: this.config.observationPoints.length
        ? this.config.observationPoints
        : [
            `primary: ${ops.inspect.method} ${ops.inspect.path}`,
            ...Object.entries(ops.inspectPoints).map(([name, op]) => `${name}: ${op.method} ${op.path}`),
          ],
      limits: [
        'Observa somente o que a operação "inspect" do residuo.json devolve; réplicas, caches e backups ficam de fora.',
        ...(caps.includes('namespace-isolation') ? [] : ['Sem isolamento declarado: execuções podem interferir umas nas outras.']),
        ...this.config.limits,
      ],
    };
  }

  async openNamespace(spec: NamespaceSpec, opts: CallOptions): Promise<void> {
    const setup = this.config.isolation.setup;
    if (!setup) return;
    const ex = await this.http(setup, spec.namespace, {}, opts);
    if (!ex.response || ex.response.status >= 300) {
      throw new AdapterError('failed', `isolamento (setup): status HTTP ${ex.response?.status ?? '—'}`, ex);
    }
  }

  async resetNamespace(namespace: string, opts: CallOptions): Promise<void> {
    const reset = this.config.isolation.reset;
    if (reset) await this.http(reset, namespace, {}, opts);
  }

  async createEntity(ns: string, input: { id: string; data: Record<string, unknown> }, opts: CallOptions): Promise<AdapterResult> {
    const op = this.config.operations.create;
    const o = await this.run('create', op, ns, { entityId: input.id, data: input.data }, opts);
    return this.result(o, {
      entityId: input.id,
      writeOutcome: asString(this.fact(op, 'writeOutcome', o)) ?? (o.accepted ? 'CREATED' : `REJECTED (HTTP ${o.status})`),
      wrote: this.bool(op, 'wrote', o) ?? o.accepted,
      ...num('generation', this.fact(op, 'generation', o)),
      ...num('revision', this.fact(op, 'revision', o)),
      ...str('opRef', this.fact(op, 'opRef', o)),
    });
  }

  async prepareUpdate(
    ns: string,
    input: { id: string; generation: number; baseRevision: number; data: Record<string, unknown> },
    opts: CallOptions,
  ): Promise<AdapterResult> {
    const op = this.config.operations.prepareUpdate;
    const o = await this.run('prepareUpdate', op, ns, { entityId: input.id, generation: input.generation, baseRevision: input.baseRevision, revision: input.baseRevision, data: input.data }, opts);
    const deliveryId = asString(this.fact(op!, 'deliveryId', o));
    if (!deliveryId) throw new AdapterError('failed', 'prepareUpdate: a resposta não trouxe o fato "deliveryId" configurado', o.exchange);
    return this.result(o, { entityId: input.id, writeOutcome: 'PREPARED', wrote: false, deliveryId, generation: input.generation, baseRevision: input.baseRevision });
  }

  async holdDelivery(ns: string, deliveryId: string, opts: CallOptions): Promise<AdapterResult> {
    const op = this.config.operations.hold;
    if (op === 'implicit') {
      return {
        exchange: { request: { method: '—', path: '(implícito no residuo.json: o que foi preparado só é entregue na liberação)' }, durationMs: 0 },
        facts: { writeOutcome: 'HELD (implícito)', wrote: false, deliveryId },
      };
    }
    const o = await this.run('hold', op, ns, { deliveryId }, opts);
    return this.result(o, { writeOutcome: 'HELD', wrote: false, deliveryId });
  }

  releaseDelivery(ns: string, deliveryId: string, opts: CallOptions): Promise<AdapterResult> {
    return this.deliver('release', this.config.operations.release, ns, deliveryId, opts);
  }

  redeliver(ns: string, deliveryId: string, opts: CallOptions): Promise<AdapterResult> {
    return this.deliver('redeliver', this.config.operations.redeliver, ns, deliveryId, opts);
  }

  async deleteEntity(ns: string, input: { id: string; generation: number }, opts: CallOptions): Promise<AdapterResult> {
    const op = this.config.operations.delete;
    const o = await this.run('delete', op, ns, { entityId: input.id, generation: input.generation }, opts);
    const generation = asNumber(this.fact(op, 'generation', o)) ?? input.generation;
    return this.result(o, {
      entityId: input.id,
      writeOutcome: asString(this.fact(op, 'writeOutcome', o)) ?? (o.accepted ? 'DELETED' : `REJECTED (HTTP ${o.status})`),
      wrote: this.bool(op, 'wrote', o) ?? o.accepted,
      ...(o.accepted ? { deletionId: asString(this.fact(op, 'deletionId', o)) ?? `${input.id}@g${generation}`, generation } : {}),
      ...num('revision', this.fact(op, 'revision', o)),
    });
  }

  async confirmDeletion(ns: string, deletionId: string, opts: CallOptions): Promise<AdapterResult> {
    const op = this.config.operations.confirmDeletion;
    const o = await this.run('confirmDeletion', op, ns, { deletionId }, opts);
    const confirmed = op!.facts.confirmed ? extract(op!.facts.confirmed, o.body, o.status) === true : o.accepted;
    return this.result(o, {
      deletionId,
      confirmed,
      confirmationStatus: asString(this.fact(op!, 'confirmationStatus', o)) ?? (confirmed ? 'effective' : `HTTP ${o.status}`),
      ...str('mechanism', this.fact(op!, 'mechanism', o)),
      ...num('generation', this.fact(op!, 'generation', o)),
    });
  }

  async restoreEntity(
    ns: string,
    input: { id: string; deletionId: string; authorization: { actor: string; reason: string } },
    opts: CallOptions,
  ): Promise<AdapterResult> {
    const op = this.config.operations.restore;
    const o = await this.run('restore', op, ns, { entityId: input.id, deletionId: input.deletionId, actor: input.authorization.actor, reason: input.authorization.reason }, opts);
    // A autorização vale só se o alvo a devolver: nada de confiar no que o Resíduo enviou.
    const actor = asString(this.fact(op!, 'actor', o));
    const reason = asString(this.fact(op!, 'reason', o));
    return this.result(o, {
      entityId: input.id,
      deletionId: input.deletionId,
      writeOutcome: asString(this.fact(op!, 'writeOutcome', o)) ?? (o.accepted ? 'RESTORED' : `REJECTED (HTTP ${o.status})`),
      wrote: this.bool(op!, 'wrote', o) ?? o.accepted,
      ...(actor && reason ? { authorization: { actor, reason } } : {}),
      ...num('generation', this.fact(op!, 'generation', o)),
      ...num('revision', this.fact(op!, 'revision', o)),
      ...str('opRef', this.fact(op!, 'opRef', o)),
    });
  }

  async takeSnapshot(ns: string, opts: CallOptions): Promise<AdapterResult> {
    const op = this.config.operations.snapshot;
    const o = await this.run('snapshot', op, ns, {}, opts);
    const snapshotId = asString(this.fact(op!, 'snapshotId', o));
    if (!snapshotId) throw new AdapterError('failed', 'snapshot: a resposta não trouxe o fato "snapshotId" configurado', o.exchange);
    return this.result(o, { writeOutcome: 'SNAPSHOT_TAKEN', wrote: false, snapshotId });
  }

  async restoreSnapshot(ns: string, snapshotId: string, opts: CallOptions): Promise<AdapterResult> {
    const op = this.config.operations.restoreSnapshot;
    const o = await this.run('restoreSnapshot', op, ns, { snapshotId }, opts);
    const reapplied = this.fact(op!, 'reappliedDeletions', o);
    return this.result(o, {
      snapshotId,
      writeOutcome: asString(this.fact(op!, 'writeOutcome', o)) ?? (o.accepted ? 'SNAPSHOT_RESTORED' : `REJECTED (HTTP ${o.status})`),
      wrote: this.bool(op!, 'wrote', o) ?? o.accepted,
      ...str('opRef', this.fact(op!, 'opRef', o)),
      ...(Array.isArray(reapplied) ? { reappliedDeletions: reapplied.length } : num('reappliedDeletions', reapplied)),
    });
  }

  async inspectEntity(ns: string, id: string, opts: CallOptions, point = 'primary'): Promise<AdapterResult> {
    const op = point === 'primary' ? this.config.operations.inspect : this.config.operations.inspectPoints[point];
    if (!op) throw new AdapterError('unsupported', `o ponto de leitura "${point}" não está configurado em operations.inspectPoints`);
    const ex = await this.http(op, ns, { entityId: id }, opts);
    const status = ex.response?.status ?? 0;
    const body = ex.response?.body;
    if (op.visible.includes(status)) {
      return {
        exchange: ex,
        facts: {
          entityId: id,
          visible: true,
          ...num('observedGeneration', extract(op.facts.generation, body, status)),
          ...num('observedRevision', extract(op.facts.revision, body, status)),
          ...str('lastWrittenBy', extract(op.facts.lastWrittenBy, body, status)),
        },
      };
    }
    const absent = op.absent;
    if (status === absent.status && (absent.path === undefined || lookup(body, absent.path) === absent.equals)) {
      return { exchange: ex, facts: { entityId: id, visible: false } };
    }
    throw new AdapterError('failed', `inspect (${point}): resposta HTTP ${status} não é "visível" nem a ausência declarada`, ex);
  }

  // ---------- internos ----------

  private async deliver(name: 'release' | 'redeliver', op: Operation | undefined, ns: string, deliveryId: string, opts: CallOptions) {
    const o = await this.run(name, op, ns, { deliveryId }, opts);
    return this.result(o, {
      deliveryId,
      writeOutcome: asString(this.fact(op!, 'writeOutcome', o)) ?? asString(lookup(o.body, 'outcome')) ?? `HTTP ${o.status}`,
      wrote: this.bool(op!, 'wrote', o) ?? o.accepted,
      ...num('generation', this.fact(op!, 'generation', o)),
      ...num('revision', this.fact(op!, 'revision', o)),
      ...str('opRef', this.fact(op!, 'opRef', o)),
    });
  }

  private async run(name: string, op: Operation | undefined, ns: string, vars: Vars, opts: CallOptions): Promise<Outcome> {
    if (!op) throw new AdapterError('unsupported', `a operação "${name}" não está configurada no residuo.json`);
    const ex = await this.http(op, ns, vars, opts);
    const status = ex.response?.status ?? 0;
    if (op.ok.includes(status)) return { exchange: ex, body: ex.response!.body, status, accepted: true };
    if (op.rejected.includes(status)) return { exchange: ex, body: ex.response!.body, status, accepted: false };
    throw new AdapterError('failed', `${name}: status HTTP ${status} fora de "ok" e "rejected"`, ex);
  }

  private fact(op: Operation, name: string, o: Outcome): unknown {
    return extract(op.facts[name], o.body, o.status);
  }

  private bool(op: Operation, name: string, o: Outcome): boolean | undefined {
    const v = this.fact(op, name, o);
    return v === undefined ? undefined : v === true || v === 'true';
  }

  private result(o: Outcome, facts: StepFacts): AdapterResult {
    return { exchange: o.exchange, facts };
  }

  private async http(call: HttpCall, ns: string, vars: Vars, opts: CallOptions): Promise<HttpExchange> {
    const all: Vars = { ...this.baseVars, ...vars, namespace: ns };
    let path: string;
    let body: unknown;
    try {
      path = renderPath(call.path, all);
      body = call.body === undefined ? undefined : render(call.body, all);
    } catch (err) {
      if (err instanceof TemplateError) throw new AdapterError('failed', `residuo.json: ${err.message}`);
      throw err;
    }
    const headers: Record<string, string> = { ...(call.headers ?? {}) };
    if (this.config.isolation.header) headers[this.config.isolation.header] = ns;
    if (body !== undefined) headers['content-type'] = 'application/json';

    const request = { method: call.method, path, ...(body !== undefined ? { body: sanitize(body) } : {}) };
    const started = performance.now();
    let res: Response;
    try {
      res = await fetch(this.config.baseUrl.replace(/\/+$/, '') + path, {
        method: call.method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (err) {
      const exchange: HttpExchange = { request, durationMs: Math.round(performance.now() - started) };
      const n = (err as Error)?.name;
      if (n === 'TimeoutError' || n === 'AbortError') throw new AdapterError('timeout', `sem resposta em ${opts.timeoutMs} ms`, exchange);
      throw new AdapterError('failed', `falha de rede: ${(err as Error)?.message ?? err}`, exchange);
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* corpo não-JSON fica como texto */
    }
    return { request, response: { status: res.status, body: sanitize(parsed) }, durationMs: Math.round(performance.now() - started) };
  }
}

function num<K extends string>(key: K, v: unknown): Partial<Record<K, number>> {
  const n = asNumber(v);
  return n === undefined ? {} : ({ [key]: n } as Record<K, number>);
}

function str<K extends string>(key: K, v: unknown): Partial<Record<K, string>> {
  const s = asString(v);
  return s === undefined ? {} : ({ [key]: s } as Record<K, string>);
}
