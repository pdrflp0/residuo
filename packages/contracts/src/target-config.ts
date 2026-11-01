import { z } from 'zod';

const Method = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const HttpCall = z.object({
  method: Method,
  path: z.string().startsWith('/'),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type HttpCall = z.infer<typeof HttpCall>;

export const FactRule = z.union([
  z.string(),
  z.object({ path: z.string(), equals: z.unknown().optional(), in: z.array(z.unknown()).optional() }),
]);
export type FactRule = z.infer<typeof FactRule>;

export const Operation = HttpCall.extend({
  ok: z.array(z.number().int()).default([200, 201]),
  rejected: z.array(z.number().int()).default([]),
  facts: z.record(z.string(), FactRule).default({}),
});
export type Operation = z.infer<typeof Operation>;

export const InspectOperation = HttpCall.extend({
  visible: z.array(z.number().int()).default([200]),
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
  isolation: z
    .object({ header: z.string().optional(), setup: HttpCall.optional(), reset: HttpCall.optional() })
    .default({}),
  operations: z.object({
    create: Operation,
    prepareUpdate: Operation.optional(),
    hold: z.union([Operation, z.literal('implicit')]).optional(),
    release: Operation.optional(),
    redeliver: Operation.optional(),
    delete: Operation,
    confirmDeletion: Operation.optional(),
    restore: Operation.optional(),
    snapshot: Operation.optional(),
    restoreSnapshot: Operation.optional(),
    inspect: InspectOperation,
    inspectPoints: z.record(z.string(), InspectOperation).default({}),
  }),
  observationPoints: z.array(z.string()).default([]),
  limits: z.array(z.string()).default([]),
});
export type TargetConfig = z.infer<typeof TargetConfig>;
export type TargetConfigInput = z.input<typeof TargetConfig>;
