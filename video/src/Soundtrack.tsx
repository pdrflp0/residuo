import { Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import manifest from './audio-manifest.json';

export type Voice = 'none' | 'say' | 'elevenlabs';

interface Segment {
  id: string;
  at: number;
  duration: number;
  file: string;
}

const MUSIC_ALONE = 0.72;
const MUSIC_UNDER_VOICE = 0.38;
const MUSIC_DUCKED = 0.13;
const RAMP = 0.3; // segundos

/**
 * Trilha original + narração opcional. A música abaixa durante as falas.
 * `video` escolhe a trilha e o roteiro: o de apresentação (intro) ou o do nível 3 (l3).
 */
export function Soundtrack({ voice, video = 'intro' }: { voice: Voice; video?: 'intro' | 'l3' }) {
  const { fps } = useVideoConfig();
  const key = video === 'l3' ? `l3-${voice}` : voice;
  const segments: Segment[] = voice === 'none' ? [] : ((manifest as Record<string, Segment[]>)[key] ?? []);

  const musicVolume = (frame: number) => {
    if (segments.length === 0) return MUSIC_ALONE;
    const t = frame / fps;
    let duck = 0;
    for (const s of segments) {
      const a = s.at - 0.15;
      const z = s.at + s.duration + 0.25;
      const w = Math.min((t - (a - RAMP)) / RAMP, (z + RAMP - t) / RAMP);
      duck = Math.max(duck, Math.max(0, Math.min(1, w)));
    }
    return MUSIC_UNDER_VOICE - (MUSIC_UNDER_VOICE - MUSIC_DUCKED) * duck;
  };

  return (
    <>
      <Audio src={staticFile(video === 'l3' ? 'audio/music-l3.wav' : 'audio/music.wav')} volume={musicVolume} />
      {segments.map((s) => (
        <Sequence key={s.id} from={Math.round(s.at * fps)} durationInFrames={Math.ceil(s.duration * fps) + 3} layout="none">
          <Audio src={staticFile(s.file)} volume={1} />
        </Sequence>
      ))}
    </>
  );
}
