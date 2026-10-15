import { Composition } from 'remotion';
import { ResiduoVideo, TOTAL_FRAMES } from './Intro';
import { L3_TOTAL_FRAMES, ResiduoNivel3 } from './l3/Nivel3';
import { FPS, loadFonts } from './theme';

loadFonts();

export function Root() {
  const common = { component: ResiduoVideo, durationInFrames: TOTAL_FRAMES, fps: FPS, width: 1920, height: 1080 } as const;
  return (
    <>
      {/* trilha original, sem narração */}
      <Composition id="ResiduoIntro" {...common} defaultProps={{ voice: 'none' as const }} />
      {/* narração com a voz do macOS (Luciana) */}
      <Composition id="ResiduoIntroNarrado" {...common} defaultProps={{ voice: 'say' as const }} />
      {/* narração com ElevenLabs (requer npm run narration:elevenlabs) */}
      <Composition id="ResiduoIntroElevenLabs" {...common} defaultProps={{ voice: 'elevenlabs' as const }} />
      {/* nível 3: backup, cache e busca, correção, relatório HTML, exploração e IA */}
      <Composition id="ResiduoNivel3" component={ResiduoNivel3} durationInFrames={L3_TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ voice: 'none' as const }} />
      <Composition id="ResiduoNivel3ElevenLabs" component={ResiduoNivel3} durationInFrames={L3_TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ voice: 'elevenlabs' as const }} />
    </>
  );
}
