/**
 * residuo.json — contrato declarativo para testar um sistema de terceiros.
 *
 * O desenvolvedor descreve, em JSON, como o Resíduo executa cada operação conceitual no
 * sistema dele (caminho, método, corpo com variáveis) e de onde tirar os fatos na resposta.
 * Nenhum código do Resíduo precisa mudar. Operação ausente = capacidade ausente: as etapas
 * que dependem dela ficam "unsupported" e o resultado vira INCONCLUSIVE, nunca aprovação.
 *
 * Variáveis disponíveis nos modelos {{...}}: namespace, entityId, generation, revision,
 * baseRevision, deliveryId, deletionId, data (e data.campo), actor, reason, além de `vars`
 * do arquivo e das passadas na linha de comando (--var chave=valor).
 */
import { z } from 'zod';

const Method = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const HttpCall = z.object({
  method: Method,
  /** Caminho com variáveis, ex.: "/notes/{{entityId}}". Valores são codificados para URL. */
  path: z.string().startsWith('/'),
  /** Corpo JSON. Uma string exatamente "{{x}}" vira o valor tipado de x; dentro de textos, é interpolada. */
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type HttpCall = z.infer<typeof HttpCall>;

/**
 * Regra para extrair um fato da resposta:
 * - "a.b.0.c"                      → valor nesse caminho do corpo JSON ("$status" = código HTTP)
 * - { path, equals }               → true se o valor for igual
 * - { path, in: [...] }            → true se o valor estiver na lista
 */
export const FactRule = z.union([
  z.string(),
  z.object({ path: z.string(), equals: z.unknown().optional(), in: z.array(z.unknown()).optional() }),
]);
export type FactRule = z.infer<typeof FactRule>;

export const Operation = HttpCall.extend({
  /** Códigos que significam "o alvo aceitou e escreveu". */
  ok: z.array(z.number().int()).default([200, 201]),
  /** Códigos que significam "o alvo recusou explicitamente" (resposta válida, nada escrito). */
  rejected: z.array(z.number().int()).default([]),
  /** Fato → regra. Nomes conhecidos: generation, revision, opRef, writeOutcome, wrote, deliveryId, deletionId, confirmed, confirmationStatus, mechanism. */
  facts: z.record(z.string(), FactRule).default({}),
});
export type Operation = z.infer<typeof Operation>;

export const InspectOperation = HttpCall.extend({
  visible: z.array(z.number().int()).default([200]),
  /** Como o alvo diz "não existe". Status e, opcionalmente, um campo do corpo para não confundir com outro 404. */
  absent: z.object({ status: z.number().int(), path: z.string().optional(), equals: z.unknown().optional() }),
  facts: z.object({ generation: FactRule, revision: FactRule.optional(), lastWrittenBy: FactRule.optional() }),
});
export type InspectOperation = z.infer<typeof InspectOperation>;

export const TargetConfig = z.object({
  $schema: z.string().optional(),
  name: z.string().min(1),
  version: z.string().default('0.0.0'),
  baseUrl: z.string().url(),
  vars: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  /** Isolamento por execução: cabeçalho enviado em toda chamada e/ou chamadas de criação e limpeza. */
  isolation: z
    .object({ header: z.string().optional(), setup: HttpCall.optional(), reset: HttpCall.optional() })
    .default({}),
  operations: z.object({
    create: Operation,
    prepareUpdate: Operation.optional(),
    /** "implicit": o que foi preparado não é entregue até a liberação (nenhuma chamada é feita). */
    hold: z.union([Operation, z.literal('implicit')]).optional(),
    release: Operation.optional(),
    redeliver: Operation.optional(),
    delete: Operation,
    confirmDeletion: Operation.optional(),
    restore: Operation.optional(),
    inspect: InspectOperation,
  }),
  observationPoints: z.array(z.string()).default([]),
  limits: z.array(z.string()).default([]),
});
export type TargetConfig = z.infer<typeof TargetConfig>;
export type TargetConfigInput = z.input<typeof TargetConfig>;
