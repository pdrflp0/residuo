# notes-sync — exemplo de integração

Uma API de notas com sincronização offline, escrita para mostrar como um sistema "de verdade" se integra ao Resíduo. Ela não compartilha código com o serviço de referência, e os nomes são diferentes de propósito: `version` em vez de `revision`, `lastWrite`, `x-tenant`, códigos de erro próprios.

- **API do app:** `POST /notes`, `GET /notes/:id`, `DELETE /notes/:id`, `GET /deletions/:id` e `POST /sync/push` (por onde clientes offline enviam as mudanças guardadas).
- **Estratégia por tenant:**
  - `upsert` aplica a mudança com `INSERT … ON CONFLICT` e recria notas apagadas (o bug);
  - `tombstone` usa inbox, lock e um marcador de exclusão por geração, e recusa a mudança com 409.
- **Ganchos de teste** (`/__residuo/*`, só com `RESIDUO_HOOKS=1`): criar e remover tenants de teste (`rsd-*`) e simular o cliente offline (guardar uma mudança, enviar e reenviar).

O mapeamento está em [residuo.json](residuo.json).

```bash
npm run db:up
npm run example:notes                                                        # porta 4300
npm run residuo -- check   --config examples/notes-sync/residuo.json
npm run residuo -- run     --config examples/notes-sync/residuo.json         # upsert: VIOLATION (sai com 1)
npm run residuo -- run     --config examples/notes-sync/residuo.json --var strategy=tombstone   # sai com 0
npm run residuo -- explore --config examples/notes-sync/residuo.json         # menor sequência: exclusão → liberar edição 1
```
