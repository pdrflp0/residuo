import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { Compare, COMPARE_FRAMES } from './scenes/Compare';
import { Demo, DEMO_FRAMES } from './scenes/Demo';
import { Evidence, EVIDENCE_FRAMES } from './scenes/Evidence';
import { Hook, HOOK_FRAMES } from './scenes/Hook';
import { Intro as ResiduoIntro, INTRO_FRAMES } from './scenes/Intro';
import { Outro, OUTRO_FRAMES } from './scenes/Outro';
import { Principles, PRINCIPLES_FRAMES } from './scenes/Principles';
import { Story, STORY_FRAMES } from './scenes/Story';

const T = 15;
const SCENES = [HOOK_FRAMES, STORY_FRAMES, INTRO_FRAMES, DEMO_FRAMES, EVIDENCE_FRAMES, COMPARE_FRAMES, PRINCIPLES_FRAMES, OUTRO_FRAMES];
export const TOTAL_FRAMES = SCENES.reduce((a, b) => a + b, 0) - T * (SCENES.length - 1);

const timing = linearTiming({ durationInFrames: T });

export function ResiduoVideo() {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={HOOK_FRAMES}>
        <Hook />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={STORY_FRAMES}>
        <Story />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={INTRO_FRAMES}>
        <ResiduoIntro />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={DEMO_FRAMES}>
        <Demo />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={EVIDENCE_FRAMES}>
        <Evidence />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={COMPARE_FRAMES}>
        <Compare />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={PRINCIPLES_FRAMES}>
        <Principles />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={OUTRO_FRAMES}>
        <Outro />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
}
