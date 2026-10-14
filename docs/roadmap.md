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

## Publicação — passos pendentes (nada foi publicado)

1. Revisar o histórico e fazer o primeiro commit (o repositório foi inicializado sem commits).
2. Criar o repositório no GitHub (público) e enviar; conferir que `.env` não está versionado.
3. Adicionar CI (GitHub Actions) com serviço `postgres:18`, rodando `npm ci`, `npm run typecheck`, `npm test` e `npx playwright install --only-shell chromium && npm run test:e2e`.
4. Gravar o vídeo de 60–90 s seguindo [demo.md](demo.md) e anexar um GIF curto ao README.
5. Opcional: deploy de demonstração (exige hospedagem com Postgres; decisão e custo do Pedro).
6. Escrever o post do LinkedIn e a frase do currículo **depois** de revisar o que foi verificado, citando só capacidades demonstráveis.
