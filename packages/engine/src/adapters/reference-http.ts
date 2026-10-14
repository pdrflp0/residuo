/**
 * Adapter HTTP para o serviço de referência (apps/reference-service).
 *
 * Responsabilidade única: traduzir as respostas do alvo em fatos (StepFacts).
 * Ele não decide se houve violação — isso é trabalho do avaliador.
 */
import {
  AdapterError,
  type AdapterDescriptor,
  type AdapterResult,
  type CallOptions,
  type HttpExchange,
  type NamespaceSpec,
  type StepFacts,
  type TargetAdapter,
} from '@residuo/contracts';
import { sanitize } from '../sanitize';

export const REFERENCE_ADAPTER_VERSION = '0.1.0';

interface ItemBody {
  id: string;
  generation: number;
  revision: number;
  lastWrittenBy: string;
}

export class ReferenceHttpAdapter implements TargetAdapter {
  constructor(private readonly baseUrl: string) {}

  describe(): AdapterDescriptor {
    return {
      name: 'reference-service-http',
      version: REFERENCE_ADAPTER_VERSION,
      capabilities: [
        'create-entity',
        'prepare-update',
        'hold-release-delivery',
        'redeliver',
        'delete-entity',
        'confirm-deletion',
        'restore-entity',
        'inspect-entity',
        'write-provenance',
        'namespace-isolation',
        'snapshot-restore',
        'inspect-derived',
      ],
      points: ['primary', 'cache', 'search'],
      observationPoints: [
        'primary: GET /ns/{ns}/items/{id} (fonte de verdade)',
        'cache: GET /ns/{ns}/cache/items/{id} (leitura com cache)',
        'search: GET /ns/{ns}/search/items/{id} (índice de busca)',
      ],
      limits: [
        'Observa somente os pontos de leitura declarados (banco, cache e índice de busca do serviço de referência); não inspeciona réplicas, logs ou armazenamento físico.',
        'Aceita apenas o serviço de referência local configurado no servidor; não testa URLs arbitrárias.',
      ],
    };
  }

  async openNamespace(spec: NamespaceSpec, opts: CallOptions): Promise<void> {
    const ex = await this.call('POST', '/namespaces', spec, opts);
    this.expect(ex, [201], 'abrir namespace');
  }

  async resetNamespace(namespace: string, opts: CallOptions): Promise<void> {
    const ex = await this.call('DELETE', `/namespaces/${enc(namespace)}`, undefined, opts);
    this.expect(ex, [200, 404], 'limpar namespace');
  }

  async createEntity(ns: string, input: { id: string; data: Record<string, unknown> }, opts: CallOptions): Promise<AdapterResult> {
    const ex = await this.call('POST', `/ns/${enc(ns)}/items`, input, opts);
    const body = this.expect(ex, [201, 409], 'criar registro');
    const item = body.item as ItemBody | undefined;
    return result(ex, {
      entityId: input.id,
      writeOutcome: String(body.outcome),
      wrote: ex.response!.status === 201,
      ...(item ? { generation: item.generation, revision: item.revision, opRef: item.lastWrittenBy } : {}),
    });
  }

  async prepareUpdate(
    ns: string,
    input: { id: string; generation: number; baseRevision: number; data: Record<string, unknown> },
    opts: CallOptions,
  ): Promise<AdapterResult> {
    const ex = await this.call('POST', `/ns/${enc(ns)}/client/updates`, input, opts);
    const body = this.expect(ex, [201], 'preparar edição');
    return result(ex, {
      entityId: input.id,
      writeOutcome: 'PREPARED',
      wrote: false,
      deliveryId: String(body.deliveryId),
      generation: input.generation,
      baseRevision: input.baseRevision,
    });
  }

  async holdDelivery(ns: string, deliveryId: string, opts: CallOptions): Promise<AdapterResult> {
    const ex = await this.call('POST', `/ns/${enc(ns)}/deliveries/${enc(deliveryId)}/hold`, undefined, opts);
    const body = this.expect(ex, [200], 'reter entrega');
    return result(ex, { entityId: String(body.entityId), writeOutcome: 'HELD', wrote: false, deliveryId });
  }

  releaseDelivery(ns: string, deliveryId: string, opts: CallOptions): Promise<AdapterResult> {
    return this.consume(ns, deliveryId, 'release', opts);
  }

  redeliver(ns: string, deliveryId: string, opts: CallOptions): Promise<AdapterResult> {
    return this.consume(ns, deliveryId, 'redeliver', opts);
  }

  async deleteEntity(ns: string, input: { id: string; generation: number }, opts: CallOptions): Promise<AdapterResult> {
    const ex = await this.call('DELETE', `/ns/${enc(ns)}/items/${enc(input.id)}?generation=${input.generation}`, undefined, opts);
    const body = this.expect(ex, [200, 404, 409], 'excluir registro');
    const deletion = body.deletion as { deletionId: string; generation: number; revision: number } | undefined;
    return result(ex, {
      entityId: input.id,
      writeOutcome: String(body.outcome),
      wrote: ex.response!.status === 200,
      ...(deletion ? { deletionId: deletion.deletionId, generation: deletion.generation, revision: deletion.revision } : {}),
    });
  }

  async confirmDeletion(ns: string, deletionId: string, opts: CallOptions): Promise<AdapterResult> {
    const ex = await this.call('GET', `/ns/${enc(ns)}/deletions/${enc(deletionId)}`, undefined, opts);
    const body = this.expect(ex, [200], 'confirmar exclusão');
    return result(ex, {
      entityId: String(body.id),
      deletionId,
      generation: Number(body.generation),
      confirmed: body.status === 'effective',
      confirmationStatus: String(body.status),
      mechanism: String(body.mechanism),
    });
  }

  async restoreEntity(
    ns: string,
    input: { id: string; deletionId: string; authorization: { actor: string; reason: string } },
    opts: CallOptions,
  ): Promise<AdapterResult> {
    const ex = await this.call(
      'POST',
      `/ns/${enc(ns)}/items/${enc(input.id)}/restore`,
      { deletionId: input.deletionId, authorization: input.authorization },
      opts,
    );
    const body = this.expect(ex, [200, 403, 409], 'restaurar registro');
    const item = body.item as ItemBody | undefined;
    // A autorização registrada vem da resposta do alvo, não do que o engine enviou.
    const recorded = body.authorization as { actor?: unknown; reason?: unknown } | undefined;
    const authorization =
      typeof recorded?.actor === 'string' && typeof recorded.reason === 'string' ? { actor: recorded.actor, reason: recorded.reason } : undefined;
    return result(ex, {
      entityId: input.id,
      writeOutcome: String(body.outcome),
      wrote: ex.response!.status === 200,
      deletionId: input.deletionId,
      ...(ex.response!.status === 200 ? { restoreId: String(body.restoreId) } : {}),
      ...(authorization ? { authorization } : {}),
      ...(item ? { generation: item.generation, revision: item.revision, opRef: item.lastWrittenBy } : {}),
    });
  }

  async takeSnapshot(ns: string, opts: CallOptions): Promise<AdapterResult> {
    const ex = await this.call('POST', `/ns/${enc(ns)}/snapshots`, undefined, opts);
    const body = this.expect(ex, [201], 'fazer backup');
    return result(ex, { writeOutcome: 'SNAPSHOT_TAKEN', wrote: false, snapshotId: String(body.snapshotId) });
  }

  async restoreSnapshot(ns: string, snapshotId: string, opts: CallOptions): Promise<AdapterResult> {
    const ex = await this.call('POST', `/ns/${enc(ns)}/snapshots/${enc(snapshotId)}/restore`, undefined, opts);
    const body = this.expect(ex, [200], 'restaurar backup');
    return result(ex, {
      writeOutcome: String(body.outcome),
      wrote: true,
      snapshotId,
      opRef: String(body.opRef),
      reappliedDeletions: Array.isArray(body.reappliedDeletions) ? body.reappliedDeletions.length : 0,
    });
  }

  async inspectEntity(ns: string, id: string, opts: CallOptions, point = 'primary'): Promise<AdapterResult> {
    const path =
      point === 'primary' ? `/ns/${enc(ns)}/items/${enc(id)}` : point === 'cache' ? `/ns/${enc(ns)}/cache/items/${enc(id)}` : point === 'search' ? `/ns/${enc(ns)}/search/items/${enc(id)}` : undefined;
    if (!path) throw new AdapterError('unsupported', `ponto de leitura desconhecido: ${point}`);
    const ex = await this.call('GET', path, undefined, opts);
    const body = this.expect(ex, [200, 404], 'ler registro');
    if (ex.response!.status === 404) {
      // Só "registro não encontrado" conta como ausência. Namespace sumido ou rota errada é falha, não evidência.
      if (body.outcome !== 'NOT_FOUND') throw new AdapterError('failed', `ler registro: 404 sem "NOT_FOUND" (${String(body.outcome ?? 'sem outcome')})`, ex);
      return result(ex, { entityId: id, visible: false });
    }
    const item = body.item as ItemBody;
    return result(ex, {
      entityId: id,
      visible: true,
      observedGeneration: item.generation,
      observedRevision: item.revision,
      lastWrittenBy: item.lastWrittenBy,
    });
  }

  private async consume(ns: string, deliveryId: string, action: 'release' | 'redeliver', opts: CallOptions): Promise<AdapterResult> {
    const ex = await this.call('POST', `/ns/${enc(ns)}/deliveries/${enc(deliveryId)}/${action}`, undefined, opts);
    const body = this.expect(ex, [200, 409], action === 'release' ? 'liberar entrega' : 'reentregar');
    const consumer = body.consumer as { outcome: string; wrote: boolean; item?: ItemBody };
    return result(ex, {
      entityId: String(body.entityId),
      deliveryId,
      writeOutcome: consumer.outcome,
      wrote: consumer.wrote,
      opRef: `delivery:${deliveryId}`,
      generation: Number(body.generation),
      baseRevision: Number(body.baseRevision),
      ...(consumer.item ? { revision: consumer.item.revision } : {}),
    });
  }

  private async call(method: string, path: string, body: unknown, opts: CallOptions): Promise<HttpExchange> {
    const started = performance.now();
    const request = { method, path, ...(body !== undefined ? { body: sanitize(body) } : {}) };
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : {},
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (err) {
      const exchange: HttpExchange = { request, durationMs: Math.round(performance.now() - started) };
      const name = (err as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new AdapterError('timeout', `sem resposta em ${opts.timeoutMs} ms`, exchange);
      }
      throw new AdapterError('failed', `falha de rede: ${(err as Error)?.message ?? err}`, exchange);
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* corpo não-JSON fica como texto */
    }
    return {
      request,
      response: { status: res.status, body: sanitize(parsed) },
      durationMs: Math.round(performance.now() - started),
    };
  }

  private expect(ex: HttpExchange, statuses: number[], what: string): Record<string, unknown> {
    const status = ex.response?.status ?? 0;
    if (!statuses.includes(status)) {
      throw new AdapterError('failed', `${what}: status HTTP ${status} inesperado`, ex);
    }
    const body = ex.response?.body;
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  }
}

const enc = encodeURIComponent;
const result = (exchange: HttpExchange, facts: StepFacts): AdapterResult => ({ exchange, facts });
