# Resíduo

[![CI](https://github.com/pdrflp0/residuo/actions/workflows/ci.yml/badge.svg)](https://github.com/pdrflp0/residuo/actions/workflows/ci.yml)

**Laboratório visual para descobrir como um registro apagado pode reaparecer numa aplicação.**

O Resíduo executa uma sequência controlada contra um serviço de teste real — criar um registro, guardar uma edição antiga, excluir, confirmar a exclusão e só então liberar a edição — e mostra, com evidência, se o registro voltou, em qual operação e se isso viola a política declarada. O resultado é um caso de bug reproduzível, com relatório exportável e um teste de regressão para acompanhar a correção.

> Níveis 1, 2 e 3 · dados sintéticos de demonstração · testa o serviço de referência ou o seu próprio sistema via `residuo.json` · ainda não validado com usuários externos.
>
> **Primeira vez aqui?** Leia [Entenda o Resíduo em 5 minutos](docs/entenda.md): o bug explicado com um exemplo do dia a dia e um glossário.

[![Vídeo de apresentação (79 s): clique para assistir](docs/img/video-capa.png)](docs/media/residuo-intro.mp4)

▶ [Assistir ao vídeo de apresentação (79 s)](docs/media/residuo-intro.mp4) — feito em código com Remotion a partir de capturas reais do app ([video/](video/)).

![Execução no modo vulnerable: a geração excluída g1 volta na etapa 9](docs/img/run-vulnerable.png)

---

## O problema, em um exemplo

1. A API cria a ficha `item-17`, **geração g1**, revisão 1.
2. Um cliente prepara uma edição a partir da revisão 1, mas o envio fica retido (fila parada, aparelho offline).
3. Outro cliente exclui o registro; o serviço **confirma** que a exclusão está em vigor.
4. A edição retida chega ao consumidor.
5. No modo `vulnerable`, o consumidor faz *upsert* por id: como a linha não existe mais, o `INSERT` recria `item-17` g1.
6. O Resíduo lê o registro de novo, vê g1 visível e associa o reaparecimento à operação que o alvo informa ter escrito por último.

No modo `guarded`, a mesma sequência termina com a edição **rejeitada explicitamente** (`409 REJECTED_DELETED`) e o registro continua ausente.

![Comparação vulnerable × guarded: mesmas etapas, resultado diferente nas etapas 8 e 9](docs/img/compare.png)

Exclusão e edição concorrentes podem ser intenções legítimas em conflito. Por isso a aplicação declara uma **política** (`delete-wins` ou `explicit-restore`), e uma restauração autorizada ou uma nova geração criada explicitamente não são tratadas como bug.

## Rodar localmente

Pré-requisitos: Node.js ≥ 22.12 (desenvolvido com 26.11) e Docker — ou qualquer PostgreSQL local (ver abaixo).

```bash
npm install
npm run db:up        # PostgreSQL 18 em localhost:54329 (docker compose)
npm run dev          # reference-service :4100 · api :4000 · web :5173
```

Abra <http://localhost:5173> e clique em **Rodar a demonstração**.

**Sem interface** (o cenário mínimo direto contra o serviço, com código de saída para scripts):

```bash
npm run lab -- --scenario held-update-after-delete --mode vulnerable   # sai com 1 (VIOLATION)
npm run lab -- --scenario held-update-after-delete --mode guarded      # sai com 0
```

**Tudo em contêineres** (a API também serve a interface compilada):

```bash
docker compose --profile full up --build   # http://localhost:4000
```

**Sem Docker:** use qualquer PostgreSQL ≥ 14 (por exemplo `brew install postgresql@18`) e aponte as variáveis de [.env.example](.env.example) (`TARGET_DATABASE_URL`, `LAB_DATABASE_URL`). Os serviços criam os próprios bancos na primeira execução.

## Outros jeitos de um registro voltar (nível 3)

[![Vídeo do nível 3 (76 s, narrado): clique para assistir](docs/img/video-nivel3-capa.png)](docs/media/residuo-nivel3.mp4)

▶ [Assistir ao vídeo do nível 3 (76 s, narrado)](docs/media/residuo-nivel3.mp4): backup, cache e busca, a correção, o relatório HTML, a exploração com 3 clientes e a IA que explica sem decidir. Também foi feito a partir de capturas reais.

Além da edição atrasada, o Resíduo reproduz dois caminhos comuns de "ressurreição":

| Cenário | O que acontece no modo vulnerável | Correção no modo protegido |
| --- | --- | --- |
| `backup-restore-after-delete` | Um backup antigo é restaurado e traz de volta o que foi apagado depois dele | Reaplica o registro de exclusões logo após o restore |
| `derived-data-after-delete` | O registro some do banco, mas continua no cache e no índice de busca | Invalida cache e índice na mesma transação da exclusão |

![Cache e busca no modo vulnerável: o banco diz 404, mas o cache e o índice ainda mostram g1](docs/img/nivel3-cache.png)

Para o segundo caso, o Resíduo vigia **vários pontos de leitura** (banco, cache, índice) e diz em qual o dado sobreviveu. Quando nenhuma escrita explica o reaparecimento, a causa é classificada como **"dado derivado não invalidado"**, em vez de culpar a operação errada.

Cada execução também pode ser exportada como **relatório HTML de arquivo único**: linha do tempo clicável, evidência HTTP e veredito, sem nenhum recurso externo. Dá para anexar numa issue ou num PR e mostrar o bug a quem não tem o Resíduo instalado. Ele é gerado pela interface ou por `residuo run --report <pasta>`.

**Resumo com IA (opcional).** Com `ANTHROPIC_API_KEY` definida na API, cada execução ganha um botão **Gerar resumo**: um modelo Claude explica o que aconteceu em linguagem simples e **cita as etapas** que sustentam cada afirmação. Cada citação é um botão que leva à evidência. A IA não decide nada. O resumo só é aceito se repetir o veredito do avaliador, se toda afirmação tiver citação, se toda citação apontar para uma etapa que existe e, havendo violação, se citar a leitura em que ela apareceu. Se não passar, é descartado e o motivo aparece. O relatório vai ao modelo como dado (as respostas do alvo podem conter texto tentando dar instruções), e o resumo fica numa tabela própria, separado do veredito. Sem a chave, o recurso fica desligado e o resto funciona igual. Pela CLI: `residuo summarize relatorio.json`.

**Mais clientes na exploração.** `residuo explore --clients 3` simula três clientes offline editando a mesma versão: são 60 ordens de entrega (até 4 clientes, 360 ordens) e a falha continua reduzida à sequência mínima.

## Testar o seu próprio sistema (nível 2)

Descreva o seu sistema num `residuo.json`: como criar, editar, apagar e ler, e onde ficam os ganchos de teste que seguram e soltam uma entrega. Depois rode a CLI, local ou no CI:

```bash
npm run residuo -- check   --config residuo.json   # valida e mostra quais cenários o seu sistema suporta
npm run residuo -- run     --config residuo.json   # 0 = ok · 1 = VIOLATION · 2 = INCONCLUSIVE
npm run residuo -- explore --config residuo.json   # testa 12 ordens de entrega e reduz a falha à sequência mínima
npm run residuo -- explore --config residuo.json --clients 3   # 3 clientes offline: 60 ordens
```

O exemplo completo é o [examples/notes-sync](examples/notes-sync), uma API de notas com sincronização offline, outros nomes de campo e um bug ligável por tenant. Para ele, `explore` encontra 9 ordens que violam e reduz a falha a `exclusão → liberar edição 1`. O guia está em [docs/integracao.md](docs/integracao.md), e o schema do arquivo, para autocomplete, em [schema/residuo.schema.json](schema/residuo.schema.json).

O mesmo formato descreve o serviço de referência ([examples/reference-service.residuo.json](examples/reference-service.residuo.json)). Um teste exige que o adapter genérico produza exatamente as mesmas etapas, os mesmos fatos e o mesmo veredito que o adapter escrito à mão, nos 4 cenários e nos 2 modos.

## Testes

```bash
npm test             # engine + integração (precisa do Postgres no ar)
npm run test:e2e     # Playwright: sobe serviços reais em portas e bancos próprios
npm run typecheck
```

| O que o teste demonstra | Onde |
| --- | --- |
| O cenário conhecido produz `VIOLATION` em `vulnerable`, com a liberação apontada como causa | [scenarios.integration.test.ts](apps/reference-service/test/scenarios.integration.test.ts) |
| A mesma sequência não observa violação em `guarded` e a edição recebe rejeição explícita | idem |
| Nova geração legítima (g2) não é classificada como g1 ressuscitada | idem |
| Confirmação indisponível, confirmação pendente e leitura sem resposta geram `INCONCLUSIVE` | idem + [evaluate.test.ts](packages/engine/test/evaluate.test.ts) |
| Resposta de escrita não é prova: só leituras após a confirmação geram violação | [evaluate.test.ts](packages/engine/test/evaluate.test.ts) |
| Reexecução preserva cenário, versão, semente e ordem, e chega à mesma classificação | integração + [api.integration.test.ts](apps/api/test/api.integration.test.ts) |
| Execuções simultâneas com o mesmo id não interferem; reset só apaga o próprio namespace | [scenarios.integration.test.ts](apps/reference-service/test/scenarios.integration.test.ts) |
| Sob corrida real (sem barreiras) entre liberação e exclusão, `guarded` nunca deixa g1 visível e só decide com o lock | [guarded-consumer.integration.test.ts](apps/reference-service/test/guarded-consumer.integration.test.ts) |
| Falha de infraestrutura (namespace sumido, banco do laboratório fora) não vira evidência nem culpa o alvo | [scenarios.integration.test.ts](apps/reference-service/test/scenarios.integration.test.ts) |
| Evidência insuficiente (escrita sem leitura posterior, leitura sem visibilidade, exclusão sem geração) nunca passa | [evaluate.test.ts](packages/engine/test/evaluate.test.ts) |
| A interface só pinta "reapareceu" o que o veredito sustenta | [entity-state.test.ts](apps/web/test/entity-state.test.ts) + [report.test.ts](packages/engine/test/report.test.ts) |
| Adapter genérico (`residuo.json`) = adapter escrito à mão, em todos os cenários e modos | [config-adapter.integration.test.ts](tests/level2/config-adapter.integration.test.ts) |
| Um sistema com outro formato de API (notes-sync) é testado só por configuração; capacidade ausente vira INCONCLUSIVE | idem |
| `explore` acha as ordens que violam e reduz à mesma sequência mínima, independente da semente | idem |
| CLI como processo real: códigos de saída, `--json`, relatórios, configuração inválida, recusa de alvo remoto, schema sincronizado | [cli.integration.test.ts](tests/level2/cli.integration.test.ts) |
| Backup restaurado e cache/índice: vulnerável viola com a causa certa; protegido reaplica exclusões e invalida derivados | [scenarios.integration.test.ts](apps/reference-service/test/scenarios.integration.test.ts) |
| Relatório HTML: sem recursos externos, imune a injeção pelos dados do alvo, abre e navega no navegador | [report.test.ts](packages/engine/test/report.test.ts) + [e2e/demo.spec.ts](e2e/demo.spec.ts) |
| Exploração com 3 clientes: 60 ordens, mesma sequência mínima; na correção, só a primeira edição entregue é aceita | [config-adapter.integration.test.ts](tests/level2/config-adapter.integration.test.ts) |
| Resumo com IA: descartado se contradiz o veredito, cita etapa inexistente ou não cita a violação; o relatório vai como dado; a URL não vem do ambiente; o veredito não muda | [ai-summary.test.ts](packages/engine/test/ai-summary.test.ts) + [api.integration.test.ts](apps/api/test/api.integration.test.ts) + [e2e/demo.spec.ts](e2e/demo.spec.ts) |
| Ponta a ponta: demo → evidência → causa → exportação idêntica à API → comparação | [e2e/demo.spec.ts](e2e/demo.spec.ts) |
| Navegação por teclado e preferência por movimento reduzido | idem |

Não há mocks do alvo: os testes de integração sobem o serviço de referência (NestJS + PostgreSQL) numa porta livre e o engine fala HTTP com ele. A única coisa substituída nos testes é a API da Anthropic (por um servidor local que responde no mesmo formato), para não depender de rede, chave nem custo. Para conferir que os testes detectam erros, introduzi defeitos de propósito e confirmei que algum teste falhava: sem a checagem de marcador de exclusão (2 testes falharam), com a fronteira "depois da confirmação" deslocada no avaliador (1 falhou), sem o lock por identidade no consumidor (o teste de corrida falhou em 3 de 3 rodadas) e, no resumo com IA, sem a checagem de veredito (3 falharam), sem a exigência de citar a violação (1 falhou) e sem o escape do relatório no prompt (1 falhou).

Uma revisão independente, feita por outro agente de IA, encontrou lacunas reais, todas corrigidas e cobertas por testes. Estão listadas em [docs/revisao.md](docs/revisao.md).

## Como ler o resultado

| Resultado | Significa | Não significa |
| --- | --- | --- |
| `VIOLATION` | A geração excluída voltou a ser visível numa leitura feita depois da confirmação da exclusão, sem restauração permitida. | Que a causa é sempre a etapa apontada: a atribuição diz se veio da procedência informada pelo alvo, da ordem, ou se é desconhecida. |
| `NO_VIOLATION_OBSERVED` | A sequência terminou e as leituras declaradas não viram a geração excluída. | Prova de correção universal. |
| `INCONCLUSIVE` | Timeout, falha de adapter, falta de observação ou exclusão não confirmada. | Aprovação. Nunca é convertido em sucesso. |
| `POLICY_ALLOWED` | Houve reaparecimento permitido, com evidência: nova geração explícita ou restauração autorizada sob `explicit-restore`. | Que qualquer restauração é aceita: sem autorização registrada, é violação. |

## Arquitetura

```
apps/web                React + Vite: bancada, linha do tempo, evidência, comparação
apps/api                NestJS: execuções, persistência (banco lab), relatórios, comparação
apps/reference-service  NestJS: o alvo testado, modos vulnerable/guarded (banco target)
packages/engine         orquestrador, avaliador de invariantes, adapter HTTP, relatórios
packages/contracts      tipos, contrato do adapter e schema do residuo.json
packages/cli            CLI residuo: check, run, explore, summarize
examples/notes-sync     app de exemplo integrado via residuo.json
```

O avaliador e o alvo ficam em bancos separados: tudo o que o Resíduo sabe do alvo passa pela API HTTP do adapter. Detalhes em [docs/arquitetura.md](docs/arquitetura.md) e decisões em [docs/decisoes.md](docs/decisoes.md).

## Documentos

- [docs/entenda.md](docs/entenda.md) — o problema em linguagem simples e glossário
- [docs/integracao.md](docs/integracao.md) — como testar o seu sistema: residuo.json, CLI, CI
- [docs/arquitetura.md](docs/arquitetura.md) — componentes, fluxo de uma execução, modelo de dados
- [docs/decisoes.md](docs/decisoes.md) — por que geração ≠ id, como a exclusão é confirmada, o que é observado, por que é reproduzível
- [docs/demo.md](docs/demo.md) — roteiro de demonstração de 60 a 90 segundos
- [docs/exemplo-relatorio.md](docs/exemplo-relatorio.md) e [.json](docs/exemplo-relatorio.json) — relatório real exportado
- [docs/revisao.md](docs/revisao.md) — o que a revisão independente encontrou e como foi corrigido
- [docs/roadmap.md](docs/roadmap.md) — níveis 2 e 3, validação com desenvolvedores, publicação
- [video/](video/) — os vídeos (apresentação e nível 3) como código (Remotion)

## Limites (importante)

- Mede **visibilidade pela API de leitura do alvo**. Ausência numa leitura não é apagamento físico de todas as cópias (réplicas, caches, backups, logs).
- A ordem é controlada por barreiras explícitas: a reexecução reproduz **este interleaving**, não a temporização de uma corrida real. A semente gera só os dados sintéticos; outras ordens de entrega são exploradas pelo `residuo explore`, não por uma execução.
- A interface web testa só o serviço de referência. Sistemas de terceiros são testados pela CLI, que por padrão recusa alvos fora de `localhost` (`--allow-remote` existe para ambientes de teste autorizados).
- Integrar exige trabalho do lado do sistema testado: mapear operações e oferecer ganchos de teste para segurar e soltar entregas. Não é automático.
- `explore` cobre de 3 a 360 ordens (1 a 4 clientes) de um conjunto pequeno de ações, e não todas as concorrências possíveis.
- O resumo com IA é opcional e envia o relatório sanitizado da execução à API da Anthropic. A conferência garante o veredito e as citações, não a interpretação: o texto pode errar, e a evidência continua sendo a fonte.
- Os pontos de leitura vigiados são os declarados (banco, cache, índice). Réplicas, logs e armazenamento físico ficam de fora.
- A política "abrir conflito para revisão humana" não está implementada: no modo `guarded`, a edição conflitante é rejeitada com resultado explícito.
- Não é certificação de privacidade, conformidade legal nem exclusão criptograficamente comprovada.
- Ainda não foi usado por desenvolvedores além do autor; utilidade e esforço de integração não estão validados.

## Referências

- [Apache Cassandra — Tombstones](https://cassandra.apache.org/doc/latest/cassandra/managing/operating/compaction/tombstones.html): dados que reaparecem a partir de réplicas antigas.
- [CelinQ — The Resurrection Problem](https://celinq.com/articles/47-resurrection-problem): o conflito exclusão/edição offline e uma solução específica. O problema não foi inventado aqui.
- [Jepsen — Analyses](https://jepsen.io/analyses): testes de correção em sistemas distribuídos; o Resíduo ocupa um recorte bem menor, focado na aplicação e na comunicação visual.

---

## English summary

**Resíduo** ("residue") is a visual lab that reproduces how a deleted record can reappear in an application. It drives a real reference service through a controlled sequence — create, prepare a stale update, hold its delivery, delete, confirm the deletion, release the update — and then reads the record again. A pure evaluator classifies the run as `VIOLATION`, `NO_VIOLATION_OBSERVED`, `INCONCLUSIVE` or `POLICY_ALLOWED` using only recorded observations: write responses are logged but never treated as proof; only reads after a confirmed deletion count.

The reference service has two modes: `vulnerable` (an upsert consumer resurrects the deleted generation) and `guarded` (inbox de-duplication, a per-identity row lock, a tombstone keyed by *(id, generation)*, and base-revision checks; every rejection is explicit). Identity is separated from **generation**, so an explicitly re-created record (g2) is not mistaken for the deleted one (g1) coming back.

Stack: TypeScript, NestJS 12, React 19 + Vite, PostgreSQL 18, Vitest, Playwright. Runs are isolated by namespace; ordering is enforced by explicit barriers (each adapter call returns only after the target finished), not sleeps. Reports export as JSON and Markdown, including a suggested regression test.

Level 2 lets anyone test their own system: describe it in a `residuo.json` (operations, fact extraction, test hooks to hold/release deliveries) and run the `residuo` CLI (`check`, `run`, `explore`) locally or in CI, with exit codes 0/1/2. `explore` runs 12 delivery orders and shrinks a failure to the minimal reproducing sequence. A generic-adapter parity test proves the config-driven adapter matches the hand-written one.

Level 3 adds two more resurrection paths — an old backup being restored (fixed by re-applying the deletion log after restore) and stale derived data in a cache or search index (multiple observation points; a `stale-derived` attribution instead of blaming a write) — plus a self-contained, injection-safe HTML report you can attach to an issue. `explore --clients N` simulates up to 4 offline clients (360 orders). An optional AI summary (Claude, via the Anthropic API) explains a run in plain language and cites the steps behind every claim; it never decides anything: it is discarded unless it repeats the evaluator's verdict, every citation points to an existing step and the violation's read step is cited.

Run it: `npm install && npm run db:up && npm run dev`, then open http://localhost:5173. Limits: it measures visibility through the target's read API only and replays controlled interleavings (not real-time races). The web UI targets the local reference service; other systems are tested through the CLI.
