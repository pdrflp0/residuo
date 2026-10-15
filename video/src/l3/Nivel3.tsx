import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { AbsoluteFill } from 'remotion';
import { Soundtrack, type Voice } from '../Soundtrack';
import { Ai, AI_FRAMES } from './Ai';
import { Backup, BACKUP_FRAMES } from './Backup';
import { Derived, DERIVED_FRAMES } from './Derived';
import { Explore, EXPLORE_FRAMES } from './Explore';
import { Fix, FIX_FRAMES } from './Fix';
import { L3Hook, L3_HOOK_FRAMES } from './Hook';
import { L3Outro, L3_OUTRO_FRAMES } from './Outro';
import { Report, REPORT_FRAMES } from './Report';

const T = 15;
const SCENES = [L3_HOOK_FRAMES, BACKUP_FRAMES, DERIVED_FRAMES, FIX_FRAMES, REPORT_FRAMES, EXPLORE_FRAMES, AI_FRAMES, L3_OUTRO_FRAMES];
/** 2295 quadros = 76,5 s. Os tempos da narração (scripts/narration.mjs, SCRIPT_L3) seguem estas cenas. */
export const L3_TOTAL_FRAMES = SCENES.reduce((a, b) => a + b, 0) - T * (SCENES.length - 1);

const timing = linearTiming({ durationInFrames: T });

export function ResiduoNivel3({ voice = 'none' }: { voice?: Voice }) {
  return (
    <AbsoluteFill>
      <Soundtrack voice={voice} video="l3" />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={L3_HOOK_FRAMES}>
          <L3Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={BACKUP_FRAMES}>
          <Backup />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={DERIVED_FRAMES}>
          <Derived />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={FIX_FRAMES}>
          <Fix />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={REPORT_FRAMES}>
          <Report />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={EXPLORE_FRAMES}>
          <Explore />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={AI_FRAMES}>
          <Ai />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={L3_OUTRO_FRAMES}>
          <L3Outro />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
}
