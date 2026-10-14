# Roadmap

O nível 1 está implementado e verificado localmente (ver README, seção Testes). Os níveis seguintes **não foram iniciados**.

## Nível 2 — usar no projeto de outro desenvolvedor

- Publicar o contrato do adapter como pacote, com um exemplo integrável (por exemplo, uma API Express/Nest com fila).
- O adapter declara capacidades e pontos de observação; o relatório lista o que ficou sem cobertura.
- Gerar variações de ordem de entrega e reduzir a sequência mínima que continua falhando (*shrinking*).
- CLI com saída de máquina (JSON) e códigos de saída estáveis para CI. O `npm run lab` atual já devolve 0/1/2, mas não é um contrato público.
- Política "abrir conflito para revisão": preservar a edição rejeitada para resolução humana, em vez de só rejeitá-la.
- O runner roda na máquina do desenvolvedor, contra ambientes autorizados, com credenciais fora dos relatórios.

## Nível 3 — recuperação e colaboração

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
