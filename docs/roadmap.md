# Roadmap

Os níveis 1, 2 e 3 (parte escolhida) estão implementados e verificados (ver README, seção Testes).

## Nível 2 — usar no projeto de outro desenvolvedor (implementado)

- [x] Contrato declarativo `residuo.json` com JSON Schema ([docs/integracao.md](integracao.md))
- [x] Adapter genérico, equivalente ao adapter escrito à mão (testado nos 4 cenários × 2 modos)
- [x] CLI `residuo` (`check`, `run`, `explore`, `schema`) com saída JSON e códigos de saída para CI
- [x] Exploração de 12 ordens de entrega com redução à menor sequência que ainda falha
- [x] App de exemplo integrado ([examples/notes-sync](../examples/notes-sync))
- [ ] Publicar a CLI no npm (exige build para JavaScript e conta no npm)
- [ ] Política "abrir conflito para revisão": preservar a edição rejeitada para resolução humana
- [ ] Interface web para alvos externos (hoje: CLI)
- [ ] Integrar com um sistema real de outra pessoa e medir o esforço

## Nível 3 — recuperação e colaboração (parte implementada)

- [x] Restauração de backup: cenário `backup-restore-after-delete`; correção que reaplica o registro de exclusões
- [x] Dados derivados: cenário `derived-data-after-delete`; vários pontos de leitura e atribuição "dado derivado não invalidado"
- [x] Relatório HTML compartilhável (arquivo único, sem recursos externos)
- [ ] Mais clientes concorrentes na exploração de ordens
- [ ] Resumo de execução com IA, citando as etapas usadas como evidência
- [ ] Pilotos com outros desenvolvedores e coleta de feedback

### Ideias originais do nível 3

- Restauração de snapshot controlado, dados derivados/cache, mais de dois clientes. Cada capacidade exige um adapter específico.
- Compartilhar evidências sanitizadas e recolher feedback de pilotos.
- IA opcional para resumir um trace ou propor cenário, sempre citando a evidência usada.

## Validação com desenvolvedores (depende do Pedro)

Conversar com 3 a 5 desenvolvedores que mantêm sincronização offline, jobs de atualização ou consumidores de eventos:

- Já tiveram registro "ressuscitado"? Como descobriram e como reproduziram?
- O que precisariam instrumentar para um adapter? Quanto esforço aceitariam?
- O relatório exportado permitiria reproduzir o caso sem conversa adicional?

Medir depois: tempo para preparar o caso, se o relatório bastou para reproduzir, esforço do adapter, bugs encontrados. **Nenhum desses números existe ainda.**

## Publicação

Feito em 14/10/2026:

- [x] Primeiro commit e repositório público [pdrflp0/residuo](https://github.com/pdrflp0/residuo)
- [x] CI no GitHub Actions (typecheck, testes com Postgres, ponta a ponta com Playwright), verde no primeiro envio
- [x] Vídeo de apresentação de 79 s ([docs/media/residuo-intro.mp4](media/residuo-intro.mp4)), gerado por código a partir de capturas reais

Pendente (decisão do Pedro):

- [ ] Publicar o post no LinkedIn com o vídeo
- [ ] Atualizar o currículo, citando só capacidades demonstráveis
- [ ] Opcional: demo online (exige hospedagem com Postgres, proteção contra abuso e custo)
