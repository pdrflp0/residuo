# Revisão independente (14/10/2026)

Depois da implementação, outro agente de IA revisou o código só por leitura, com a especificação do produto em mãos. Ele encontrou problemas reais; todos foram corrigidos e receberam testes. A lista vale como registro e como material de entrevista: são erros sutis, típicos de ferramentas de diagnóstico.

| Achado | Por que importava | Correção | Teste |
| --- | --- | --- | --- |
| Todo 404 numa leitura era tratado como "registro ausente", inclusive `NAMESPACE_NOT_FOUND` | Um namespace apagado no meio da execução transformava `vulnerable` em `NO_VIOLATION_OBSERVED` | O adapter só aceita ausência com `outcome: NOT_FOUND`; qualquer outro 404 é falha | namespace removido antes da leitura final → `INCONCLUSIVE` |
| Escrita depois da última leitura não exigia nova leitura | Uma edição podia recriar o registro sem ninguém olhar, e o resultado saía "sem violação" | Exige uma leitura posterior à última escrita após a confirmação | `evaluate.test.ts` |
| Exclusão sem geração e leitura "ok" sem visibilidade eram ignoradas | Falta de dado virava aprovação silenciosa | Viram motivos de `INCONCLUSIVE` | `evaluate.test.ts` |
| Falha ao gravar a observação era registrada como falha do alvo, e a etapa aparecia duas vezes | Culpava o sistema testado por um erro do laboratório | Chamada ao alvo e gravação separadas; erro de gravação interrompe a execução | `onStep` que falha → execução rejeitada, sem etapa duplicada |
| A autorização da restauração vinha do que o engine enviou, não do que o alvo registrou | Um alvo que restaurasse sem guardar a autorização ainda receberia `POLICY_ALLOWED` | Usa `authorization` da resposta e exige o mesmo `deletionId` da exclusão confirmada | integração + `evaluate.test.ts` |
| Upsert relatado aparecia como "reapareceu" mesmo em execução inconclusiva | A interface afirmava mais do que a evidência | O tom de reaparecimento numa escrita só vem do veredito | `entity-state.test.ts`, `report.test.ts` |
| A comparação marcava diferenças enquanto uma execução ainda rodava | "O resultado mudou de VIOLATION para —" | Só compara quando as duas terminaram | `report.test.ts` |
| O teste de corrida passava mesmo sem o lock | Teste que não detecta o defeito que deveria detectar | Passou a exigir `APPLIED` ou `REJECTED_DELETED`, nunca `REJECTED_NOT_FOUND` | verificado removendo o lock (3/3 falhas) |
| Execução manual abandonada ficava como `completed`; um avanço logo após a pausa podia receber 409 | Estado errado no histórico; corrida na barreira | Abandono vira `interrupted`; a barreira é registrada antes de anunciar a pausa | — |
| Portas do compose expostas em todas as interfaces | Reset sem autenticação e banco com senha conhecida acessíveis na rede local | Portas presas a `127.0.0.1` | — |

Também foram removidos dois testes que não podiam falhar (um testava só o helper; outro verificava um campo que a validação já descarta) e ajustados detalhes do relatório: linha de reprodução com `--timeout`, quebras de linha escapadas e um aviso no teste de regressão sugerido.

Áreas sem achados relevantes: ordem dos locks no consumidor protegido (sem deadlock), SQL parametrizado, reset preso ao prefixo `rsd-`, ausência de URL de alvo arbitrária.
