# Relatório Resíduo — Atualização retida chega depois da exclusão

> Dados sintéticos de demonstração, gerados contra o serviço de referência local.

**Resultado:** VIOLATION — a geração excluída voltou

A geração g1 de item-17, excluída e confirmada na etapa 6, voltou a ficar visível na etapa 9. O alvo informa que a última escrita veio de "Liberar edição antiga" (etapa 8, resultado UPSERT_INSERTED).

## Configuração

| Campo | Valor |
| --- | --- |
| Execução | `run_4096eecb4d` |
| Cenário | `held-update-after-delete` v1.0.0 |
| Modo do alvo | `vulnerable` |
| Política declarada | `delete-wins` |
| Semente | 1200 |
| Falha injetada | `none` |
| Registro testado | `item-17` |
| Namespace | `rsd-run-4096eecb4d` |
| Engine | v0.1.0 |
| Adapter | reference-service-http v0.1.0 |
| Gerado em | 2026-10-14T06:26:32.342Z |

## Linha do tempo

| # | Faixa | Etapa | Status | Resposta | O que foi registrado |
| --- | --- | --- | --- | --- | --- |
| 1 | api | Criar registro | ok | 201 | Registro criado: g1, revisão 1. |
| 2 | client | Preparar edição offline | ok | 201 | Edição preparada a partir da revisão 1 de g1. |
| 3 | client | Reter envio | ok | 200 | Entrega retida: o consumidor ainda não recebeu a edição. |
| 4 | observer | Ler estado inicial | ok | 200 | Leitura: g1 visível, revisão 1. |
| 5 | api | Excluir registro | ok | 200 | Exclusão aceita para g1 (revisão 1). |
| 6 | api | Confirmar exclusão | ok | 200 | Exclusão em vigor (mecanismo: row-removed). |
| 7 | observer | Ler após exclusão | ok | 404 | Leitura: registro ausente. |
| 8 | consumer | Liberar edição antiga | ok | 200 | O alvo relata que o consumidor aplicou a edição por upsert e INSERIU o registro de novo (g1, revisão 2). |
| 9 | observer | Ler estado final | ok | 200 | Leitura: a geração excluída g1 está visível de novo. |

## Violações

### `deleted-generation-stays-gone` — item-17 g1

A geração g1 de item-17, excluída e confirmada na etapa 6, voltou a ficar visível na etapa 9. O alvo informa que a última escrita veio de "Liberar edição antiga" (etapa 8, resultado UPSERT_INSERTED).

Atribuição da causa: **provenance** (etapa 8).

Evidências:

**Etapa 5 — Excluir registro** (api, ok)

```http
DELETE /ns/rsd-run-4096eecb4d/items/item-17?generation=1
```
```json
// HTTP 200
{
  "outcome": "DELETED",
  "deletion": {
    "id": "item-17",
    "status": "effective",
    "revision": 1,
    "mechanism": "row-removed",
    "deletionId": "del_961efe89a8ec",
    "generation": 1
  }
}
```

**Etapa 6 — Confirmar exclusão** (api, ok)

```http
GET /ns/rsd-run-4096eecb4d/deletions/del_961efe89a8ec
```
```json
// HTTP 200
{
  "id": "item-17",
  "status": "effective",
  "revision": 1,
  "mechanism": "row-removed",
  "deletionId": "del_961efe89a8ec",
  "generation": 1,
  "effectiveAt": "2026-10-14T06:26:29.264Z"
}
```

**Etapa 8 — Liberar edição antiga** (consumer, ok)

```http
POST /ns/rsd-run-4096eecb4d/deliveries/dlv_8df7143d3a0a/release
```
```json
// HTTP 200
{
  "consumer": {
    "item": {
      "id": "item-17",
      "revision": 2,
      "generation": 1,
      "lastWrittenBy": "delivery:dlv_8df7143d3a0a"
    },
    "wrote": true,
    "outcome": "UPSERT_INSERTED"
  },
  "entityId": "item-17",
  "deliveryId": "dlv_8df7143d3a0a",
  "generation": 1,
  "baseRevision": 1,
  "deliveryCount": 1
}
```

**Etapa 9 — Ler estado final** (observer, ok)

```http
GET /ns/rsd-run-4096eecb4d/items/item-17
```
```json
// HTTP 200
{
  "item": {
    "id": "item-17",
    "data": {
      "note": "edição offline: corrigir telefone",
      "title": "Cadastro de fornecedor"
    },
    "revision": 2,
    "updatedAt": "2026-10-14T06:26:29.271Z",
    "generation": 1,
    "lastWrittenBy": "delivery:dlv_8df7143d3a0a"
  }
}
```

## Pontos verificados

- Etapa 4 (`inspect-before`): visível g1
- Etapa 7 (`inspect-deleted`): ausente — após a confirmação
- Etapa 9 (`inspect-after`): visível g1 — após a confirmação

## Como reproduzir

Com o ambiente local no ar (ver README):

```bash
npm run lab -- --scenario held-update-after-delete --mode vulnerable --policy delete-wins --seed 1200 --fault none --timeout 3000
```

Ou via API:

```bash
curl -s -X POST http://localhost:4000/api/runs -H 'content-type: application/json' -d '{"scenarioId":"held-update-after-delete","mode":"vulnerable","policy":"delete-wins","seed":1200,"fault":"none","timeoutMs":3000}'
```

## Teste de regressão sugerido

Para acompanhar a correção: o mesmo cenário, a mesma semente, exigindo ausência de violação.

```ts
import { expect, test } from 'vitest';
import { executeScenario, getScenario, ReferenceHttpAdapter } from '@residuo/engine';

// Gerado a partir da execução run_4096eecb4d (held-update-after-delete v1.0.0, semente 1200).
// Ajuste `mode` para a configuração corrigida do alvo. No serviço de referência, `guarded` corrige
// os cenários de entrega atrasada e replay; uma restauração autorizada sob "delete-wins" não tem modo
// corretivo: este teste só passa quando a política ou o serviço mudarem.
test('held-update-after-delete: a geração excluída não volta (semente 1200)', async () => {
  const scenario = getScenario('held-update-after-delete')!;
  const { verdict } = await executeScenario({
    scenario,
    config: {
      scenarioId: scenario.id,
      scenarioVersion: '1.0.0',
      mode: 'guarded',
      policy: 'delete-wins',
      seed: 1200,
      fault: 'none',
      stepMode: 'auto',
      timeoutMs: 3000,
    },
    namespace: `rsd-regression-${Date.now()}`,
    adapter: new ReferenceHttpAdapter(process.env.REFERENCE_SERVICE_URL ?? 'http://localhost:4100'),
  });
  expect(verdict.violations).toEqual([]);
  expect(verdict.result).not.toBe('INCONCLUSIVE');
});
```

## Limites desta evidência

- Ausência de violação vale para esta sequência e estes pontos de observação; não prova correção em geral.
- A ordem é controlada por barreiras explícitas: a reexecução reproduz este interleaving, não a temporização de uma corrida real.
- A semente gera apenas os dados sintéticos; outras ordens de entrega não são exploradas nesta versão.
- Ausência numa leitura não equivale a apagamento físico de todas as cópias (réplicas, caches, backups, logs).
- Não é certificação de privacidade, conformidade legal nem exclusão criptograficamente comprovada.
- Observa somente a visibilidade pela API de leitura do alvo; não inspeciona réplicas, caches, backups, logs ou armazenamento físico.
- Aceita apenas o serviço de referência local configurado no servidor; não testa URLs arbitrárias.
