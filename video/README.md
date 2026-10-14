# Vídeo de apresentação

Vídeo de ~79 s (1920×1080, 30 fps) feito em código com [Remotion](https://www.remotion.dev/), ou seja, em React. As cenas de demonstração usam **capturas reais** do app rodando, com a posição dos elementos medida durante a captura. Nada é desenhado à mão.

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
npm run studio       # pré-visualização interativa
npm run render       # gera out/residuo-intro.mp4
```

O Remotion baixa o próprio Chrome headless na primeira renderização. Para reaproveitar o do Playwright, passe `--browser-executable=<caminho do chrome-headless-shell>`.

Licença do Remotion: gratuita para pessoas físicas e empresas pequenas (ver remotion.dev/license).
