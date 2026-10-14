/**
 * Contrato do adapter: a única ponte entre o engine e o sistema testado.
 *
 * O engine não conhece tabelas, filas ou código do alvo. Ele pede operações conceituais
 * e recebe (a) a troca HTTP sanitizada e (b) fatos interpretados. Se o alvo não oferece
 * uma capacidade, o adapter lança AdapterError('unsupported') e o engine registra a limitação
 * em vez de inventar o resultado.
 */
import type { AdapterDescriptor, Fault, HttpExchange, StepFacts, TargetMode } from './domain';

export interface AdapterResult {
  exchange: HttpExchange;
  facts: StepFacts;
}

export type AdapterErrorKind = 'timeout' | 'failed' | 'unsupported';

export class AdapterError extends Error {
  constructor(
    readonly kind: AdapterErrorKind,
    message: string,
    readonly exchange?: HttpExchange,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export interface NamespaceSpec {
  namespace: string;
  mode: TargetMode;
  fault: Fault;
}

export interface CallOptions {
  timeoutMs: number;
}

export interface TargetAdapter {
  describe(): AdapterDescriptor;
  openNamespace(spec: NamespaceSpec, opts: CallOptions): Promise<void>;
  resetNamespace(namespace: string, opts: CallOptions): Promise<void>;

  createEntity(ns: string, input: { id: string; data: Record<string, unknown> }, opts: CallOptions): Promise<AdapterResult>;
  prepareUpdate(
    ns: string,
    input: { id: string; generation: number; baseRevision: number; data: Record<string, unknown> },
    opts: CallOptions,
  ): Promise<AdapterResult>;
  holdDelivery(ns: string, deliveryId: string, opts: CallOptions): Promise<AdapterResult>;
  releaseDelivery(ns: string, deliveryId: string, opts: CallOptions): Promise<AdapterResult>;
  redeliver(ns: string, deliveryId: string, opts: CallOptions): Promise<AdapterResult>;
  deleteEntity(ns: string, input: { id: string; generation: number }, opts: CallOptions): Promise<AdapterResult>;
  confirmDeletion(ns: string, deletionId: string, opts: CallOptions): Promise<AdapterResult>;
  restoreEntity(
    ns: string,
    input: { id: string; deletionId: string; authorization: { actor: string; reason: string } },
    opts: CallOptions,
  ): Promise<AdapterResult>;
  inspectEntity(ns: string, id: string, opts: CallOptions): Promise<AdapterResult>;
}
