import { Composition } from 'remotion';
import { ResiduoVideo, TOTAL_FRAMES } from './Intro';
import { FPS, loadFonts } from './theme';

loadFonts();

export function Root() {
  return <Composition id="ResiduoIntro" component={ResiduoVideo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />;
}
