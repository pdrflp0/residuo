/**
 * Gera a narração em trechos sincronizados com as cenas do vídeo.
 *
 *   node scripts/narration.mjs say          # voz do macOS (Luciana), sem conta
 *   node scripts/narration.mjs elevenlabs   # ElevenLabs; lê a chave de video/.env.local
 *
 * video/.env.local (não vai para o git):
 *   ELEVENLABS_API_KEY=...
 *   ELEVENLABS_VOICE_ID=...   # opcional; escolha uma voz pt-BR na Voice Library
 *
 * Saída: public/audio/narration-<motor>/<id>.wav e src/audio-manifest.json (início e duração de cada trecho).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

/** Roteiro: `at` é o segundo do vídeo em que o trecho começa. */
export const SCRIPT = [
  { id: 'hook-1', at: 0.4, text: 'Você apagou. O servidor confirmou.' },
  { id: 'hook-2', at: 3.2, text: 'E ele voltou.' },
  { id: 'story-1', at: 5.2, text: 'Uma nota é criada no servidor.' },
  { id: 'story-2', at: 7.6, text: 'No celular sem internet, uma edição fica presa.' },
  { id: 'story-3', at: 11.0, text: 'No notebook, a nota é apagada. O servidor confirma.' },
  { id: 'story-4', at: 14.8, text: 'O celular reconecta e envia a edição antiga.' },
  { id: 'story-5', at: 17.85, text: 'Não existe? Então cria. E a nota volta.' },
  { id: 'intro', at: 21.2, text: 'O Resíduo provoca esse bug de propósito, contra um serviço real, e prova o que aconteceu.' },
  { id: 'demo-1', at: 28.4, text: 'Com um clique, o cenário roda.' },
  { id: 'demo-2', at: 30.8, text: 'Cria o registro, prepara uma edição offline e segura o envio.' },
  { id: 'demo-3', at: 35.3, text: 'Lê, apaga, e espera a confirmação.' },
  { id: 'demo-4', at: 38.4, text: 'Daqui pra frente, nada pode voltar.' },
  { id: 'demo-5', at: 41.2, text: 'A edição antiga chega…' },
  { id: 'demo-6', at: 43.0, text: 'e a leitura vê o registro de novo. Violação.' },
  { id: 'evidence-1', at: 46.9, text: 'Cada etapa guarda a requisição e a resposta.' },
  { id: 'evidence-2', at: 49.8, text: 'E o próprio serviço aponta a causa: a etapa oito.' },
  { id: 'compare-1', at: 54.5, text: 'No modo protegido, a mesma edição antiga é recusada.' },
  { id: 'compare-2', at: 59.6, text: 'Inbox, lock por identidade, e uma lápide por geração.' },
  { id: 'rules', at: 65.0, text: 'Três regras: geração não é ID. Escrita não é evidência. E, sem prova, não há aprovação.' },
  { id: 'outro', at: 73.3, text: 'Resíduo. Código aberto, no GitHub.' },
];

const engine = process.argv[2] ?? 'say';
if (!['say', 'elevenlabs'].includes(engine)) throw new Error('use: say | elevenlabs');

const root = new URL('..', import.meta.url).pathname;
const outDir = `${root}public/audio/narration-${engine}/`;
await mkdir(outDir, { recursive: true });

/** Duração de um WAV PCM lendo o cabeçalho (procura o bloco "data"). */
function wavDuration(file) {
  const b = readFileSync(file);
  const channels = b.readUInt16LE(22);
  const rate = b.readUInt32LE(24);
  const bits = b.readUInt16LE(34);
  let off = 12;
  while (off < b.length - 8) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'data') return size / (rate * channels * (bits / 8));
    off += 8 + size + (size % 2);
  }
  throw new Error(`WAV sem bloco data: ${file}`);
}

function pcmToWav(pcm, rate, channels = 1) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * 2, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function loadEnv() {
  const file = `${root}.env.local`;
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

async function synthSay(seg, wav) {
  execFileSync('say', [
    '-v', process.env.SAY_VOICE ?? 'Luciana',
    '-r', process.env.SAY_RATE ?? '205',
    '--file-format=WAVE', '--data-format=LEI16@44100',
    '-o', wav, seg.text,
  ]);
}

async function synthEleven(seg, wav, prev, next) {
  const env = { ...loadEnv(), ...process.env };
  const key = env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY ausente: crie video/.env.local (ver cabeçalho deste arquivo)');
  const voice = env.ELEVENLABS_VOICE_ID ?? 'JBFqnCBsd6RMkjVDRZzb';
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=pcm_44100`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: seg.text,
      model_id: env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2',
      language_code: 'pt',
      previous_text: prev?.text,
      next_text: next?.text,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 1.05 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs respondeu HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  // pcm_44100 = PCM 16 bits mono cru; vira WAV sem precisar de ffmpeg
  await writeFile(wav, pcmToWav(Buffer.from(await res.arrayBuffer()), 44100));
}

/** Remove silêncio no começo e no fim (mantém 40 ms), para o trecho caber na janela. */
function trimWav(file) {
  const b = readFileSync(file);
  const channels = b.readUInt16LE(22);
  const rate = b.readUInt32LE(24);
  let off = 12;
  while (b.toString('ascii', off, off + 4) !== 'data') off += 8 + b.readUInt32LE(off + 4);
  const pcm = b.subarray(off + 8, off + 8 + b.readUInt32LE(off + 4));
  const frames = pcm.length / (2 * channels);
  const loud = (f) => Math.abs(pcm.readInt16LE(f * 2 * channels)) > 600;
  let a = 0;
  while (a < frames && !loud(a)) a++;
  let z = frames - 1;
  while (z > a && !loud(z)) z--;
  const pad = Math.floor(rate * 0.04);
  a = Math.max(0, a - pad);
  z = Math.min(frames - 1, z + pad);
  return writeFile(file, pcmToWav(Buffer.from(pcm.subarray(a * 2 * channels, (z + 1) * 2 * channels)), rate, channels));
}

const segments = [];
for (const [i, seg] of SCRIPT.entries()) {
  const wav = `${outDir}${seg.id}.wav`;
  if (engine === 'say') await synthSay(seg, wav);
  else await synthEleven(seg, wav, SCRIPT[i - 1], SCRIPT[i + 1]);
  await trimWav(wav);
  const dur = wavDuration(wav);
  segments.push({ id: seg.id, at: seg.at, duration: Number(dur.toFixed(3)), file: `audio/narration-${engine}/${seg.id}.wav` });
}

// avisa quando um trecho invade o próximo
let ok = true;
for (const [i, s] of segments.entries()) {
  const limit = segments[i + 1]?.at ?? 79;
  const end = s.at + s.duration;
  const flag = end > limit - 0.1 ? '  <-- passa do próximo trecho' : '';
  if (flag) ok = false;
  console.log(`${s.id.padEnd(11)} ${s.at.toFixed(1).padStart(5)}s → ${end.toFixed(1).padStart(5)}s (limite ${limit.toFixed(1)})${flag}`);
}

const manifestFile = `${root}src/audio-manifest.json`;
const manifest = JSON.parse(await readFile(manifestFile, 'utf8').catch(() => '{"say":[],"elevenlabs":[]}'));
manifest[engine] = segments;
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(ok ? 'narração sincronizada.' : 'há trechos longos demais: encurte o texto ou ajuste a velocidade.');
