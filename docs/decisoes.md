# Decisões de projeto

Cada bloco responde a uma pergunta que provavelmente aparece numa entrevista. O link aponta para onde a decisão vive no código.

---

## 1. Por que geração é diferente de id?

**Problema.** Se o sistema só conhece o id, "o `item-17` está visível depois da exclusão" é ambíguo: pode ser a ficha antiga ressuscitada (bug) ou uma ficha nova, criada de propósito com o mesmo id (legítimo).

**Decisão.** Cada id tem um contador de **gerações** que sobrevive à exclusão ([`identities`](../apps/reference-service/src/db.ts)). Criar depois de excluir abre g2. A revisão conta versões *dentro* de uma geração. Toda atualização carrega `(id, geração, revisão-base)`.

**Consequência.** O avaliador compara a geração observada com a geração excluída. g1 visível depois da exclusão confirmada → violação. g2 visível, com uma criação explícita registrada → `POLICY_ALLOWED`. O cenário de controle `new-generation-control` existe para provar isso nos dois modos.

## 2. Como a exclusão é confirmada?

**Problema.** "A API respondeu 200 ao DELETE" não garante que a política esteja em vigor (em sistemas reais a exclusão pode ser assíncrona: replicação, filas, caches).

**Decisão.** Confirmar é uma etapa separada: o engine consulta `GET /ns/{ns}/deletions/{id}` e só aceita `status: "effective"` ([`confirmDeletion`](../packages/engine/src/adapters/reference-http.ts)). O invariante só começa a valer **depois** dessa confirmação; na interface, isso é a "zona vigiada".

**Consequência.** Sem confirmação (503 ou `pending`) o resultado é `INCONCLUSIVE`, mesmo que o registro apareça depois. Isso está testado com o modo `vulnerable` e a falha `confirm-pending`: o registro volta, mas o engine se recusa a concluir sem a confirmação.

## 3. O que o teste observa (e o que não observa)?

**Decisão.** Escrita e leitura são registros distintos. A resposta do consumidor (`UPSERT_INSERTED`) é guardada como fato **relatado pelo alvo**, mas o veredito só considera **leituras** feitas pelo observador ([`evaluate.ts`](../packages/engine/src/evaluate.ts)). O teste "upsert relatado mas leitura ausente não é violação" fixa essa regra.

**Atribuição de causa.** Quando há violação, o engine tenta associá-la a uma escrita, nesta ordem:
1. `provenance` — o alvo informa quem escreveu por último (`lastWrittenBy`) e isso casa com uma etapa;
2. `ordering` — houve exatamente uma escrita entre a leitura anterior e a atual;
3. `unknown` — não há evidência suficiente, e o relatório diz isso em vez de chutar.

**Não observado:** réplicas, caches, backups, logs, armazenamento físico. O relatório lista esses limites.

## 4. Por que o caso é reproduzível?

- **Ordem por barreiras, não por relógio.** Cada chamada ao adapter só retorna depois que o alvo terminou a operação. A liberação de uma entrega devolve o resultado do consumidor na mesma resposta, numa única transação ([`consume`](../apps/reference-service/src/store.ts)). A próxima etapa só começa depois disso. Nenhum `sleep` decide a ordem.
- **Cenário versionado.** O relatório grava `scenarioId@version`. O replay recusa rodar se a versão não existir mais no engine.
- **Semente para os dados.** A semente gera o id e o conteúdo sintéticos (`1200` → `item-17`); ela não gera temporização.
- **Isolamento.** Cada execução tem um namespace `rsd-…` próprio no alvo. Execuções simultâneas com o mesmo id não interferem (testado).

**Limite honesto:** isso reproduz *um interleaving controlado*. Não reproduz a temporização de uma corrida real. Para mostrar que a proteção não depende das barreiras, há um teste separado que dispara liberação e exclusão ao mesmo tempo, 15 vezes, e verifica que `guarded` nunca deixa g1 visível.

## 5. O que torna o modo `guarded` correto?

Em [`consumers.ts`](../apps/reference-service/src/consumers.ts), dentro de uma transação:

1. **Inbox**: `INSERT … ON CONFLICT DO NOTHING` pelo id da entrega. Uma reentrega vira `DUPLICATE_IGNORED` (idempotência; padrão Inbox).
2. **Lock da identidade** (`SELECT … FOR UPDATE` em `identities`): o mesmo lock é usado por criar, excluir e restaurar, então a decisão não corre contra uma exclusão concorrente.
3. **Marcador de exclusão por (id, geração)** → `REJECTED_DELETED`.
4. Geração e revisão-base precisam bater com a linha atual → `REJECTED_GENERATION_MISMATCH` / `REJECTED_STALE_REVISION`.
5. **Atualização nunca cria linha** → `REJECTED_NOT_FOUND`.

O modo `vulnerable` é um `INSERT … ON CONFLICT (ns, id) DO UPDATE`: quando a linha some, o "conflito" deixa de existir e o INSERT recria a geração antiga. O `RETURNING (xmax = 0)` diz se foi inserção ou atualização. É assim que o alvo relata `UPSERT_INSERTED`.

## 6. Por que dois bancos?

O alvo (`residuo_target`) e o laboratório (`residuo_lab`) ficam em bancos diferentes. O avaliador não tem como "espiar" tabelas do alvo: tudo o que ele sabe passa pelo adapter HTTP, como aconteceria com uma aplicação de outra pessoa. O histórico explicativo (execuções, observações, violações) fica separado da fonte de verdade testada.

## 7. Por que `INCONCLUSIVE` nunca vira aprovação?

Precedência em `evaluate`: sem confirmação → `INCONCLUSIVE`; com violação observada → `VIOLATION` (uma falha posterior não apaga uma evidência já vista); qualquer falha, timeout ou leitura faltando → `INCONCLUSIVE`; só então `POLICY_ALLOWED` ou `NO_VIOLATION_OBSERVED`. Execuções interrompidas por reinício do servidor também são fechadas como `INCONCLUSIVE` ([`run-executor.ts`](../apps/api/src/run-executor.ts)).

## 8. A animação decide alguma coisa?

Não. A interface reproduz as observações já gravadas e só deriva estado delas ([`entity-state.ts`](../apps/web/src/entity-state.ts)). O veredito aparece imediatamente, sem esperar a animação. A animação pode ser desligada e respeita `prefers-reduced-motion`. O modo "passo a passo" é diferente: ali a barreira é real, e nada acontece no alvo até o usuário avançar.

## 9. Escolhas de stack

- **NestJS 12 é ESM e roda via `tsx`.** O `tsx` (esbuild) não emite `emitDecoratorMetadata`, então a injeção de dependência usa `@Inject(Token)` explícito. É um pouco mais verboso, mas elimina o passo de build no servidor e deixa as dependências visíveis. O typecheck roda com `tsc --noEmit` (TypeScript 7).
- **npm workspaces**, sem pnpm/turbo: menos ferramentas para um projeto deste tamanho.
- **Zod** valida a entrada nas bordas HTTP. Erros de validação devolvem 400 com os campos.
- **Sem roteador e sem gerenciador de estado no front**: rota por hash e polling simples enquanto a execução não termina.

## 10. Por que vigiar vários pontos de leitura? (nível 3)

"Sumiu do banco" não é o mesmo que "sumiu para o usuário". Cache e índice de busca guardam cópias, e uma exclusão que não as invalida deixa o dado visível. Por isso a inspeção ganhou um **ponto de leitura** (`primary`, `cache`, `search`), e cada ponto em que o dado sobreviveu vira uma violação separada.

Nesses casos não existe uma escrita culpada: o problema é a **falta** de invalidação. Em vez de forçar uma atribuição, o avaliador usa `stale-derived` ("dado derivado não invalidado") quando o alvo não informa procedência. A correção no modo protegido apaga cache e índice **na mesma transação** da exclusão ([store.ts](../apps/reference-service/src/store.ts)).

## 11. Por que reaplicar exclusões depois de um restore? (nível 3)

Um backup é uma foto do passado; restaurá-lo traz de volta o que foi apagado depois da foto. A correção mantém o registro de exclusões **fora** do backup e o reaplica logo após o restore, dentro da mesma transação. O relatório mostra quantas exclusões foram reaplicadas.

Restaurar um backup **não** conta como "restauração autorizada", mesmo na política `explicit-restore`: autorização vale por registro, com ator e motivo.

## 12. Por que o relatório HTML não carrega nada de fora? (nível 3)

Ele é feito para circular: issue, PR, e-mail. Por isso é um arquivo único, sem scripts, fontes ou estilos externos (funciona offline e não vaza nada para terceiros). Como as evidências trazem respostas de sistemas de terceiros, os dados vão embutidos como JSON escapado e todo texto é inserido com `textContent`: uma resposta maliciosa não consegue injetar HTML. Há um teste específico para isso.

## Como explicar em 30 segundos

> "Fiz um laboratório que reproduz um bug clássico de sistemas offline e orientados a eventos: um registro excluído volta porque uma atualização antiga chega depois e o consumidor faz upsert. O engine executa a sequência contra um serviço real, com barreiras explícitas em vez de sleeps, e decide o resultado só a partir de leituras feitas depois da exclusão confirmada. Separei id de geração para não confundir uma recriação legítima com ressurreição. No modo protegido uso inbox, lock por identidade e marcador de exclusão por geração. A interface mostra a linha do tempo, a evidência HTTP de cada etapa e a comparação entre os dois modos, e exporta um relatório com um teste de regressão."
