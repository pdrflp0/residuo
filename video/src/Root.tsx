import { Composition } from 'remotion';
import { ResiduoVideo, TOTAL_FRAMES } from './Intro';
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
    </>
  );
}
