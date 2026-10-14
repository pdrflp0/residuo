import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  GatewayTimeoutException,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Fault, Mode } from '@residuo/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { TargetStore } from './store';

/** Só namespaces de teste: o reset nunca alcança nada fora do prefixo `rsd-`. */
const NamespaceId = z.string().regex(/^rsd-[a-z0-9-]{1,80}$/, 'namespace deve começar com "rsd-"');
const ItemId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const OpaqueId = z.string().regex(/^[a-z]{3}_[a-f0-9]{12}$/);
const Data = z.record(z.string(), z.unknown());

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new BadRequestException({ outcome: 'INVALID_INPUT', issues: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  return r.data;
}

export const SERVICE_VERSION = '0.1.0';

@Controller()
export class MetaController {
  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('about')
  about() {
    return { name: 'residuo-reference-service', version: SERVICE_VERSION, modes: Mode.options, faults: Fault.options };
  }
}

@Controller('namespaces')
export class NamespacesController {
  constructor(@Inject(TargetStore) private readonly store: TargetStore) {}

  @Post()
  create(@Body() body: unknown) {
    const input = parse(z.object({ namespace: NamespaceId, mode: Mode, fault: Fault.default('none') }), body);
    return this.store.createNamespace(input.namespace, input.mode, input.fault);
  }

  @Get(':ns')
  get(@Param('ns') ns: string) {
    return this.store.getNamespace(parse(NamespaceId, ns));
  }

  @Delete(':ns')
  async reset(@Param('ns') ns: string, @Res({ passthrough: true }) res: Response) {
    const removed = await this.store.deleteNamespace(parse(NamespaceId, ns));
    res.status(removed ? 200 : 404);
    return { outcome: removed ? 'RESET' : 'NAMESPACE_NOT_FOUND', ns };
  }
}

@Controller('ns/:ns')
export class ItemsController {
  constructor(@Inject(TargetStore) private readonly store: TargetStore) {}

  @Post('items')
  create(@Param('ns') ns: string, @Body() body: unknown) {
    const input = parse(z.object({ id: ItemId, data: Data }), body);
    return this.store.createItem(parse(NamespaceId, ns), input.id, input.data);
  }

  @Get('items/:id')
  async get(@Param('ns') rawNs: string, @Param('id') rawId: string, @Res({ passthrough: true }) res: Response) {
    const ns = parse(NamespaceId, rawNs);
    const space = await this.store.getNamespace(ns);
    if (space.fault === 'inspect-hang') {
      // Falha injetada: a leitura não responde até o cliente desistir (ou 30 s).
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 30_000);
        res.on('close', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      throw new GatewayTimeoutException({ outcome: 'INSPECT_HANG' });
    }
    return this.store.getItem(ns, parse(ItemId, rawId));
  }

  @Delete('items/:id')
  remove(@Param('ns') ns: string, @Param('id') id: string, @Query('generation') generation: string) {
    return this.store.deleteItem(parse(NamespaceId, ns), parse(ItemId, id), parse(z.coerce.number().int().positive(), generation));
  }

  @Get('deletions/:deletionId')
  async deletion(@Param('ns') rawNs: string, @Param('deletionId') deletionId: string) {
    const ns = parse(NamespaceId, rawNs);
    const space = await this.store.getNamespace(ns);
    if (space.fault === 'confirm-unavailable') {
      throw new ServiceUnavailableException({ outcome: 'CONFIRMATION_UNAVAILABLE' });
    }
    return this.store.getDeletion(ns, parse(OpaqueId, deletionId));
  }

  @Post('items/:id/restore')
  @HttpCode(200)
  restore(@Param('ns') ns: string, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(
      z.object({ deletionId: OpaqueId, authorization: z.object({ actor: z.string().max(80), reason: z.string().max(200) }).partial().optional() }),
      body,
    );
    return this.store.restoreItem(parse(NamespaceId, ns), parse(ItemId, id), input.deletionId, input.authorization);
  }
}

@Controller('ns/:ns')
export class DeliveriesController {
  constructor(@Inject(TargetStore) private readonly store: TargetStore) {}

  @Post('client/updates')
  prepare(@Param('ns') ns: string, @Body() body: unknown) {
    const input = parse(
      z.object({ id: ItemId, generation: z.number().int().positive(), baseRevision: z.number().int().positive(), data: Data }),
      body,
    );
    return this.store.prepareUpdate(parse(NamespaceId, ns), input);
  }

  @Post('deliveries/:deliveryId/hold')
  @HttpCode(200)
  hold(@Param('ns') ns: string, @Param('deliveryId') deliveryId: string) {
    return this.store.holdDelivery(parse(NamespaceId, ns), parse(OpaqueId, deliveryId));
  }

  @Post('deliveries/:deliveryId/release')
  release(@Param('ns') ns: string, @Param('deliveryId') deliveryId: string, @Res({ passthrough: true }) res: Response) {
    return this.consume(ns, deliveryId, 'release', res);
  }

  @Post('deliveries/:deliveryId/redeliver')
  redeliver(@Param('ns') ns: string, @Param('deliveryId') deliveryId: string, @Res({ passthrough: true }) res: Response) {
    return this.consume(ns, deliveryId, 'redeliver', res);
  }

  private async consume(ns: string, deliveryId: string, kind: 'release' | 'redeliver', res: Response) {
    const result = await this.store.consume(parse(NamespaceId, ns), parse(OpaqueId, deliveryId), kind);
    res.status(result.consumer.outcome.startsWith('REJECTED') ? 409 : 200);
    return result;
  }
}
