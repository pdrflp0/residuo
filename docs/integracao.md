# Testar o seu sistema com o Resíduo

O Resíduo testa qualquer API HTTP que siga um contrato descrito num arquivo `residuo.json`. Você não escreve código do Resíduo. Você descreve **como** criar, editar, apagar e ler no seu sistema, e **onde** fica o ponto de controle que segura e solta uma entrega.

> Integração tem custo. O Resíduo não descobre sozinho como o seu sistema funciona: alguém precisa mapear as operações e oferecer ganchos de teste. Um exemplo completo está em [examples/notes-sync](../examples/notes-sync).

## 1. O que o seu sistema precisa oferecer

| Capacidade | Para quê | Obrigatória? |
| --- | --- | --- |
| Criar, apagar e ler um registro | Base de todos os cenários | Sim |
| Informar a **geração** do registro na leitura | Distinguir "voltou" de "foi criado de novo" | Sim |
| **Preparar** uma edição sem entregá-la | Simular o cliente offline ou a mensagem presa na fila | Para os cenários de entrega |
| **Soltar** a entrega quando o Resíduo mandar (e, se possível, **reentregar**) | É a barreira que torna o teste reproduzível | Para os cenários de entrega |
| **Confirmar** que a exclusão está em vigor | Sem confirmação, o resultado é INCONCLUSIVE | Recomendada |
| Dizer **quem escreveu por último** | Permite apontar a causa com certeza ("provenance") | Recomendada |
| Isolar cada execução (tenant, schema, prefixo) | Execuções não interferem entre si | Recomendada |

As capacidades de teste costumam virar rotas que só existem em ambiente de teste. O exemplo usa `/__residuo/*`, ligadas apenas com `RESIDUO_HOOKS=1`.

**Geração.** Se o seu sistema ainda não tem esse conceito, é um bom ponto de partida para a própria correção do bug: um contador por id que só aumenta. Criar de novo depois de apagar abre a geração seguinte.

## 2. O arquivo `residuo.json`

```json
{
  "$schema": "./schema/residuo.schema.json",
  "name": "meu-sistema",
  "baseUrl": "http://127.0.0.1:3000",
  "vars": { "strategy": "upsert" },
  "isolation": {
    "header": "x-tenant",
    "setup": { "method": "POST", "path": "/__residuo/tenants", "body": { "tenant": "{{namespace}}" } },
    "reset": { "method": "DELETE", "path": "/__residuo/tenants/{{namespace}}" }
  },
  "operations": {
    "create": { "method": "POST", "path": "/notes", "body": { "id": "{{entityId}}", "title": "{{data.title}}" },
                "ok": [201], "facts": { "generation": "generation", "revision": "version", "opRef": "lastWrite" } },
    "prepareUpdate": { "method": "POST", "path": "/__residuo/client-queue", "body": { "noteId": "{{entityId}}", "baseVersion": "{{baseRevision}}" },
                       "ok": [201], "facts": { "deliveryId": "changeId" } },
    "hold": "implicit",
    "release": { "method": "POST", "path": "/__residuo/client-queue/{{deliveryId}}/send", "ok": [200], "rejected": [409],
                 "facts": { "writeOutcome": "result", "wrote": { "path": "result", "in": ["recreated", "updated"] }, "opRef": "note.lastWrite" } },
    "delete": { "method": "DELETE", "path": "/notes/{{entityId}}", "ok": [200], "facts": { "deletionId": "deletionId", "generation": "generation" } },
    "confirmDeletion": { "method": "GET", "path": "/deletions/{{deletionId}}", "ok": [200], "facts": { "confirmed": { "path": "status", "equals": "effective" } } },
    "inspect": { "method": "GET", "path": "/notes/{{entityId}}",
                 "absent": { "status": 404, "path": "code", "equals": "NOTE_NOT_FOUND" },
                 "facts": { "generation": "generation", "revision": "version", "lastWrittenBy": "lastWrite" } }
  }
}
```

- **Variáveis** nos modelos: `namespace`, `entityId`, `generation`, `revision`, `baseRevision`, `deliveryId`, `deletionId`, `data` (e `data.campo`), `actor`, `reason`, mais `vars` do arquivo e `--var` da linha de comando. `"{{x}}"` sozinho vira o valor com tipo (número, objeto); dentro de um texto, é interpolado. Variável não definida é erro, nunca texto vazio.
- **Fatos** são caminhos com ponto na resposta JSON (`note.version`, `items.0.id`), `$status` para o código HTTP, ou regras `{ "path", "equals" }` e `{ "path", "in" }`.
- **`ok` × `rejected`**: `ok` quer dizer "aceitou e escreveu"; `rejected` quer dizer "recusou explicitamente". Qualquer outro código é falha, e o resultado vira INCONCLUSIVE.
- **`absent`** precisa identificar o "não existe" do seu sistema. Use também um campo do corpo: assim um 404 de rota errada ou de tenant inexistente não é confundido com "registro apagado".
- **`hold: "implicit"`**: use quando o que foi preparado só é entregue no `release`.
- Operação ausente = capacidade ausente. O `check` mostra quais cenários ficam de fora.

O schema completo, para autocomplete no editor, está em [schema/residuo.schema.json](../schema/residuo.schema.json).

## 3. Rodar

```bash
npm run residuo -- check   --config residuo.json        # valida e lista o que dá para testar
npm run residuo -- run     --config residuo.json        # roda os cenários suportados
npm run residuo -- explore --config residuo.json        # testa 12 ordens de entrega e reduz a falha
```

| Opção | Efeito |
| --- | --- |
| `--scenario <id>` | um cenário só (escolhido explicitamente, roda mesmo sem a capacidade e vira INCONCLUSIVE) |
| `--var chave=valor` | variável para os modelos (ex.: `--var strategy=tombstone`) |
| `--json` | saída para máquinas |
| `--report <pasta>` | relatório Markdown e JSON de cada execução |
| `--budget <n>` | `explore`: limita as ordens; a semente decide quais |
| `--allow-remote` | permite alvo fora de localhost (só em ambientes que você pode modificar) |

**Códigos de saída:** `0` sem violação · `1` VIOLATION · `2` INCONCLUSIVE · `64` uso incorreto · `65` `residuo.json` inválido.

### No CI (GitHub Actions)

```yaml
- name: Subir o sistema com ganchos de teste
  run: RESIDUO_HOOKS=1 npm start &
- name: Resíduo
  run: npx residuo run --config residuo.json --report residuo-relatorios
- uses: actions/upload-artifact@v4
  if: always()
  with: { name: residuo, path: residuo-relatorios }
```

> A CLI ainda não está publicada no npm. Por enquanto, rode a partir de um clone deste repositório (`npm run residuo -- …`).

## 4. Explorar ordens de entrega

`explore` combina quatro ações: excluir (com confirmação), liberar a edição 1, liberar a edição 2 e reentregar a edição 1. Isso dá 12 ordens válidas. Depois da exclusão, toda ação é seguida de uma leitura. Se alguma ordem violar o invariante, a CLI remove ações enquanto a violação continuar e mostra a **menor sequência que ainda reproduz o bug**. No exemplo `notes-sync` com `upsert`, o resultado é `exclusão → liberar edição 1`.

São interleavings controlados de um conjunto pequeno de ações, cada um executado de forma determinística. Não é exploração exaustiva de concorrência real.

## 5. Segurança

- O Resíduo **cria, altera e apaga dados** no alvo. Por padrão, só aceita `localhost`; `--allow-remote` existe para ambientes de teste que você está autorizado a modificar.
- Use ganchos de teste desligados em produção e tenants ou namespaces de teste com prefixo próprio. O exemplo só aceita `rsd-*`.
- Credenciais não vão no `residuo.json`. Passe por `--var` a partir de variáveis do CI, e lembre que os relatórios mascaram campos como `authorization` e `token`.
