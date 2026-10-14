# Vídeo de apresentação

Vídeo de 79 s (1920×1080, 30 fps, com trilha original e narração opcional) feito em código com [Remotion](https://www.remotion.dev/), ou seja, em React. As cenas de demonstração usam **capturas reais** do app rodando, com a posição dos elementos medida durante a captura. Nada é desenhado à mão.

| Cena | Arquivo |
| --- | --- |
| "Você apagou. Ele voltou." | [Hook.tsx](src/scenes/Hook.tsx) |
| Como o bug acontece (app de notas offline) | [Story.tsx](src/scenes/Story.tsx) |
| O que é o Resíduo | [Intro.tsx](src/scenes/Intro.tsx) |
| Demo real, etapa por etapa | [Demo.tsx](src/scenes/Demo.tsx) |
| Evidência HTTP e causa | [Evidence.tsx](src/scenes/Evidence.tsx) |
| Comparação com o modo protegido | [Compare.tsx](src/scenes/Compare.tsx) |
| Três regras do veredito | [Principles.tsx](src/scenes/Principles.tsx) |
| Encerramento | [Outro.tsx](src/scenes/Outro.tsx) |

## Regerar

Com o app no ar (`npm run db:up && npm run dev` na raiz):

```bash
cd video
npm install
npm run capture      # cria execuções reais e salva capturas + geometria em public/shots
npm run music        # gera a trilha original em public/audio/music.wav
npm run studio       # pré-visualização interativa
npm run render       # gera out/residuo-intro.mp4
```

## Áudio

- **Trilha:** composta por código (`scripts/music.mjs`), sintetizada do zero. Não usa samples nem música de terceiros, então não tem problema de copyright. `npm run music` gera `public/audio/music.wav`.
- **Narração:** o roteiro e o tempo de cada fala estão em `scripts/narration.mjs`. A música abaixa sozinha durante as falas.
  - Voz do macOS: `npm run narration:say` e depois `npm run render:narrado`.
  - ElevenLabs: copie `.env.local.example` para `.env.local`, preencha a chave e o ID da voz, e rode `npm run narration:elevenlabs` e depois `npm run render:elevenlabs`. O script avisa se algum trecho ficar longo demais para a cena.

O Remotion baixa o próprio Chrome headless na primeira renderização. Para reaproveitar o do Playwright, passe `--browser-executable=<caminho do chrome-headless-shell>`.

Licença do Remotion: gratuita para pessoas físicas e empresas pequenas (ver remotion.dev/license).
