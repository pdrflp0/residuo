# Roteiro de demonstração (60–90 s)

Preparação: `npm run db:up && npm run dev`, navegador em <http://localhost:5173> com janela de ~1440 px. Deixe "Animações" ligado.

| Tempo | Ação | O que dizer |
| --- | --- | --- |
| 0–10 s | Página inicial; aponte os quatro cartões da história. | "Um registro foi apagado e a exclusão confirmada. Se uma edição antiga chegar depois, ele pode voltar?" |
| 10–15 s | Clique em **Rodar a demonstração**. | "Isto roda contra um serviço real com Postgres, no modo vulnerável." |
| 15–35 s | Deixe a linha do tempo tocar. Aponte a faixa do cliente offline (edição retida), a exclusão e a confirmação. | "Depois da confirmação começa a zona vigiada: a partir daqui, g1 não pode reaparecer." |
| 35–45 s | A etapa 8 fica vermelha; a 9 também. Clique em **Ver o reaparecimento (etapa 9)**. | "A leitura independente vê g1 de novo. O veredito vem desta leitura, não da resposta do consumidor." |
| 45–55 s | Clique em **ir para a causa (etapa 8)** e mostre `UPSERT_INSERTED` na resposta. | "O alvo informa que a última escrita veio desta entrega: o upsert recriou a linha apagada." |
| 55–75 s | Clique em **Repetir em guarded e comparar**. | "Mesmo cenário, mesma semente, modo protegido: a edição é rejeitada com 409 e o registro continua ausente." |
| 75–90 s | Mostre as evidências lado a lado e o botão **Relatório Markdown** (na página da execução). | "Exporto o caso com configuração, evidências, limites e um teste de regressão para acompanhar a correção." |

Variações rápidas para entrevista:

- **Controle**: cenário "nova geração criada explicitamente" → `POLICY_ALLOWED` nos dois modos ("g2 não é g1 ressuscitada").
- **Política importa**: "Restauração autorizada" com `explicit-restore` → `POLICY_ALLOWED`; com `delete-wins` → `VIOLATION`.
- **Sem evidência não há aprovação**: opções avançadas → "confirmação nunca fica efetiva" → `INCONCLUSIVE`, mesmo com o registro visível.
- **Barreira real**: marque "Avançar etapa por etapa" e libere a edição você mesmo.
