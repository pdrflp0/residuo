# Entenda o Resíduo em 5 minutos

Este guia não exige conhecimento prévio de sistemas distribuídos. Se você só tem um minuto, leia a primeira seção.

## 1. O bug, num exemplo do dia a dia

Imagine um app de notas que funciona offline.

1. Você cria a nota **"Lista de compras"**.
2. No **celular, sem internet**, você edita a nota. A edição fica guardada no aparelho, esperando a conexão voltar.
3. No **notebook**, você apaga a nota. O servidor confirma: *apagada*.
4. O celular volta a ter internet e envia aquela edição antiga.
5. O servidor recebe *"atualize a nota X"* e usa a lógica **"se existe, atualiza; se não existe, cria"** (o famoso *upsert*). Como a nota não existe mais, ele **cria de novo**.
6. A nota que você apagou **voltou**.

O mesmo acontece com filas de mensagens que entregam uma mensagem duas vezes, com jobs atrasados e com réplicas de banco desatualizadas. Quando o dado é pessoal, "apaguei e voltou" também é um problema de privacidade.

### Outros dois caminhos para o dado voltar

- **Backup restaurado.** Você apaga a nota hoje. Amanhã a empresa restaura o backup de ontem, depois de um incidente qualquer. A nota volta junto, porque estava no backup.
- **Cache e busca.** A nota some do banco, mas a tela ainda a mostra, porque estava em cache. Ou ela continua aparecendo na busca, porque o índice não foi atualizado.

## 2. O que o Resíduo faz

O Resíduo é um **laboratório**: ele provoca essa situação de propósito, numa ordem controlada, e **prova com evidência** o que aconteceu.

```
criar → preparar edição antiga → reter a entrega → apagar → confirmar → soltar a edição → ler de novo
```

Na última etapa ele **lê o registro de novo**, como um observador independente, e decide:

| Resultado | Quando |
| --- | --- |
| `VIOLATION` | O registro apagado voltou a aparecer depois que a exclusão foi confirmada. |
| `NO_VIOLATION_OBSERVED` | Nas leituras feitas, ele continuou apagado. (Não é prova de que nunca vai voltar, só de que não voltou neste teste.) |
| `INCONCLUSIVE` | Faltou prova: algo deu timeout, a exclusão não foi confirmada etc. **Nunca é tratado como aprovado.** |
| `POLICY_ALLOWED` | Ele voltou, mas de um jeito permitido: alguém criou um registro novo com o mesmo nome, ou um operador restaurou com autorização. |

## 3. Os dois modos do serviço testado

O Resíduo testa um serviço de verdade (NestJS + PostgreSQL) que tem duas versões:

- **`vulnerable`**: o consumidor faz *upsert*. A edição antiga recria o registro apagado. É o bug.
- **`guarded`**: a versão corrigida. A edição antiga é **recusada com uma resposta explícita** (`409 REJECTED_DELETED`), e o registro continua apagado.

Rodar o mesmo cenário nos dois modos e comparar é a demonstração principal.

## 4. Glossário

| Termo | Em linguagem simples |
| --- | --- |
| **Registro** | Uma "ficha" no banco de dados, por exemplo `item-17`. |
| **Geração** (g1, g2) | A "vida" do registro. Apagar encerra a g1. Criar de novo com o mesmo nome abre a **g2**, o que é legítimo. O bug é a **g1** voltar. |
| **Revisão** (r1, r2) | A versão do registro dentro da mesma vida. Cada edição aumenta a revisão. |
| **Revisão-base** | A versão a partir da qual uma edição foi feita. Uma edição feita sobre r1 quando o registro já está em r2 está desatualizada. |
| **Entrega retida** | A edição presa no celular offline ou na fila, esperando para ser enviada. |
| **Consumidor** | O código do servidor que processa as edições que chegam da fila. |
| **Upsert** | "Atualiza se existe, senão cria". Útil, mas é o vilão desta história. |
| **Confirmação da exclusão** | O servidor garantindo que a exclusão está valendo. Só a partir daí o Resíduo começa a vigiar (a "zona vigiada" na tela). |
| **Tombstone (lápide)** | Um registro de que "a g1 de `item-17` foi apagada". O modo `guarded` consulta a lápide e recusa edições antigas daquela vida. |
| **Inbox** | Uma lista das mensagens já processadas. Se a mesma mensagem chegar de novo, é ignorada (isso é **idempotência**). |
| **Lock** | Uma trava no banco que impede que a exclusão e a edição decidam ao mesmo tempo, cada uma sem enxergar a outra. |
| **Política** | A regra declarada pela aplicação: "exclusão é definitiva" (`delete-wins`) ou "pode voltar só com restauração autorizada" (`explicit-restore`). |
| **Escrita × leitura** | Escrita é o que o servidor **diz** que fez. Leitura é o que o Resíduo **vê** depois. O veredito usa as leituras. |
| **Namespace** | Uma "caixinha" isolada para cada execução, para que testes diferentes não se misturem. |
| **Semente** | Um número que gera sempre os mesmos dados de teste. A semente `1200` gera o registro `item-17`. |
| **Backup / restore** | Cópia do estado num momento; restaurar volta tudo para aquele momento, inclusive o que foi apagado depois. |
| **Cache** | Cópia rápida de uma leitura anterior. Se não for invalidada na exclusão, continua mostrando o dado apagado. |
| **Índice de busca** | Resumo dos registros usado pela busca. Também precisa ser limpo quando algo é apagado. |
| **Ponto de leitura** | Onde o Resíduo lê para verificar: banco (fonte de verdade), cache, índice. |
| **Barreira** | O ponto em que o Resíduo espera uma etapa terminar antes de começar a próxima. É o que torna a ordem reproduzível, sem depender de "esperar um tempinho". |
| **Resumo com IA** | Uma explicação em texto escrita por um modelo de IA, opcional. Cada frase cita as etapas em que se apoia. Ela não decide o resultado: se contradisser o veredito ou citar uma etapa que não existe, é descartada. |

## 5. Como ler a tela

1. **Cartões no topo**: o estado do registro, da edição pendente e da exclusão até a etapa atual.
2. **Linha do tempo**: quatro faixas (API, cliente offline, consumidor, observador) e as etapas em ordem. A área listrada à direita é a **zona vigiada**, depois da confirmação.
3. **Evidência**: clique numa etapa para ver a requisição e a resposta HTTP reais e os fatos que o Resíduo extraiu delas.
4. **Repetir em guarded e comparar**: mesmo cenário, outro modo. As etapas que mudaram ganham a marca **≠**.
5. **Resumo com IA** (se estiver ligado): a explicação em texto, com botões "etapa N" que levam à evidência citada.

## 6. O que ele não promete

- Ele mede o que a **API de leitura** do serviço mostra. Cache, índice de busca e backup só entram nos cenários do nível 3, pelos pontos de leitura que o sistema oferece; réplicas, logs e o disco ficam de fora.
- Ele reproduz **ordens controladas** de eventos (uma por execução, ou até 360 com `residuo explore`), não a temporização de uma corrida real.
- Ele não é certificação de privacidade nem de conformidade com a LGPD.
