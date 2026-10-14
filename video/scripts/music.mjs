/**
 * Trilha original, sintetizada do zero (sem samples, sem copyright de terceiros).
 * Ambiente calmo em Lá menor, 90 BPM, com pontos de sincronia com o vídeo:
 *   3,3 s  impacto em "Ele voltou."      20,5 s  o arpejo entra (apresentação do Resíduo)
 *   28 s   batida suave (demo)           42,9 s  impacto leve (etapa 9: g1 voltou)
 *   72,5 s encerramento, só acordes      79 s    fim
 *
 *   npm run music   →  public/audio/music.wav
 */
import { mkdir, writeFile } from 'node:fs/promises';

const SR = 44100;
const DUR = 79;
const N = SR * DUR;
const BEAT = 60 / 90;
const BAR = BEAT * 4;

const L = new Float32Array(N);
const R = new Float32Array(N);
const sendL = new Float32Array(N); // envio para o reverb
const sendR = new Float32Array(N);
const arpL = new Float32Array(N); // arpejo passa pelo delay antes
const arpR = new Float32Array(N);

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const TAU = Math.PI * 2;
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function add(buf, i, v) {
  if (i >= 0 && i < N) buf[i] += v;
}

// ---------- harmonia ----------
const CHORDS = [
  { pad: [57, 60, 64, 67, 71], bass: 45, arp: [69, 72, 76, 79, 83, 79, 76, 72] }, // Am9
  { pad: [53, 57, 60, 64, 67], bass: 41, arp: [65, 69, 72, 76, 79, 76, 72, 69] }, // Fmaj9
  { pad: [55, 60, 64, 67, 71], bass: 48, arp: [67, 72, 76, 79, 83, 79, 76, 72] }, // Cmaj7/G
  { pad: [52, 55, 59, 62, 67], bass: 40, arp: [64, 67, 71, 74, 79, 74, 71, 67] }, // Em7
];
const CHORD_LEN = BAR * 2;
const chordAt = (t) => CHORDS[Math.floor(t / CHORD_LEN) % CHORDS.length];

// ---------- pad ----------
for (let c = 0; c * CHORD_LEN < DUR; c++) {
  const chord = CHORDS[c % CHORDS.length];
  const t0 = c * CHORD_LEN;
  const t1 = Math.min(DUR, t0 + CHORD_LEN);
  const attack = 1.4;
  const release = 1.6;
  for (const [vi, note] of chord.pad.entries()) {
    for (const detune of [-0.0018, 0.0018]) {
      const f = hz(note) * (1 + detune);
      const pan = detune < 0 ? 0.35 : 0.65;
      const start = Math.floor(t0 * SR);
      const end = Math.min(N, Math.floor((t1 + release) * SR));
      const phase0 = vi * 1.3;
      for (let i = start; i < end; i++) {
        const t = i / SR;
        const env = Math.min(1, (t - t0) / attack) * (t > t1 ? Math.max(0, 1 - (t - t1) / release) : 1);
        const ph = TAU * f * t + phase0;
        const s = (Math.sin(ph) + 0.32 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph) + 0.05 * Math.sin(4 * ph)) * env * 0.022;
        const lfo = 1 + 0.1 * Math.sin(TAU * 0.13 * t + vi);
        L[i] += s * lfo * (1 - pan) * 2;
        R[i] += s * lfo * pan * 2;
        sendL[i] += s * 0.5;
        sendR[i] += s * 0.5;
      }
    }
  }
}

// ---------- baixo (tempos 1 e 3, a partir da história) ----------
for (let t = Math.ceil(5 / (BEAT * 2)) * BEAT * 2; t < 74; t += BEAT * 2) {
  const f = hz(chordAt(t).bass);
  const start = Math.floor(t * SR);
  for (let k = 0; k < SR * 1.3; k++) {
    const tt = k / SR;
    const env = Math.min(1, tt / 0.012) * Math.exp(-tt / 0.55);
    const ph = TAU * f * tt;
    const s = (Math.sin(ph) + 0.45 * Math.sin(2 * ph)) * env * 0.075;
    add(L, start + k, s);
    add(R, start + k, s);
  }
}

// ---------- arpejo (colcheias, a partir de 20,5 s) ----------
const ARP_START = 20.5;
const ARP_END = 72.5;
const VEL = [1, 0.55, 0.8, 0.55, 0.9, 0.55, 0.75, 0.6];
for (let n = 0, t = Math.ceil(ARP_START / (BEAT / 2)) * (BEAT / 2); t < ARP_END; t += BEAT / 2, n++) {
  const chord = chordAt(t);
  const note = chord.arp[n % 8];
  const f = hz(note);
  const v = VEL[n % 8] * Math.min(1, (t - ARP_START) / 3) * (t > ARP_END - 3 ? (ARP_END - t) / 3 : 1);
  const pan = n % 2 ? 0.3 : 0.7;
  const start = Math.floor(t * SR);
  for (let k = 0; k < SR * 0.9; k++) {
    const tt = k / SR;
    const env = Math.min(1, tt / 0.004) * Math.exp(-tt / 0.22);
    const ph = TAU * f * tt;
    const s = (Math.sin(ph) + 0.4 * Math.sin(2 * ph) * Math.exp(-tt / 0.08) + 0.1 * Math.sin(3 * ph)) * env * 0.05 * v;
    add(arpL, start + k, s * (1 - pan) * 2);
    add(arpR, start + k, s * pan * 2);
  }
}
// delay pingue-pongue (colcheia pontuada) no arpejo
{
  const d = Math.floor(BEAT * 0.75 * SR);
  const fb = 0.34;
  const outL = new Float32Array(N);
  const outR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    outL[i] = arpL[i] + (i >= d ? outR[i - d] * fb : 0);
    outR[i] = arpR[i] + (i >= d ? outL[i - d] * fb : 0);
  }
  for (let i = 0; i < N; i++) {
    L[i] += arpL[i] + (outL[i] - arpL[i]) * 0.55;
    R[i] += arpR[i] + (outR[i] - arpR[i]) * 0.55;
    sendL[i] += outL[i] * 0.4;
    sendR[i] += outR[i] * 0.4;
  }
}

// ---------- batida suave e chocalho (demo até o fim) ----------
const BEAT_START = 28;
const BEAT_END = 72.5;
for (let t = Math.ceil(BEAT_START / BEAT) * BEAT, n = 0; t < BEAT_END; t += BEAT, n++) {
  const start = Math.floor(t * SR);
  if (n % 2 === 0) {
    let ph = 0;
    for (let k = 0; k < SR * 0.45; k++) {
      const tt = k / SR;
      const f = 45 + 70 * Math.exp(-tt / 0.03);
      ph += (TAU * f) / SR;
      const s = Math.sin(ph) * Math.exp(-tt / 0.16) * 0.14;
      add(L, start + k, s);
      add(R, start + k, s);
    }
  }
}
for (let t = Math.ceil(BEAT_START / (BEAT / 2)) * (BEAT / 2), n = 0; t < BEAT_END; t += BEAT / 2, n++) {
  const start = Math.floor(t * SR);
  const v = n % 2 ? 0.012 : 0.006;
  let prev = 0;
  for (let k = 0; k < SR * 0.05; k++) {
    const x = rnd();
    const hp = x - prev; // passa-altas simples
    prev = x;
    const s = hp * Math.exp(-(k / SR) / 0.012) * v;
    add(L, start + k, s * 0.8);
    add(R, start + k, s * 1.2);
  }
}

// ---------- subida + impacto ----------
function riser(t0, t1, amp) {
  let lp = 0;
  for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) {
    const p = (i / SR - t0) / (t1 - t0);
    const a = 0.02 + p * 0.25; // filtro abre
    lp += a * (rnd() - lp);
    const s = lp * p * p * amp;
    L[i] += s;
    R[i] += s;
    sendL[i] += s;
    sendR[i] += s;
  }
}
function impact(t0, amp) {
  const start = Math.floor(t0 * SR);
  let lp = 0;
  for (let k = 0; k < SR * 2.2; k++) {
    const tt = k / SR;
    const sub = Math.sin(TAU * 52 * tt) * Math.exp(-tt / 0.7);
    lp += 0.08 * (rnd() - lp);
    const noise = lp * Math.exp(-tt / 0.25) * 1.6;
    const s = (sub + noise) * amp;
    add(L, start + k, s);
    add(R, start + k, s);
    add(sendL, start + k, s * 0.6);
    add(sendR, start + k, s * 0.6);
  }
}
riser(2.0, 3.33, 0.5);
impact(3.33, 0.3);
riser(41.9, 42.93, 0.22);
impact(42.93, 0.15);

// ---------- reverb (Schroeder simples) ----------
function reverb(input, combMs, apMs) {
  const out = new Float32Array(N);
  for (const ms of combMs) {
    const d = Math.floor((ms / 1000) * SR);
    const buf = new Float32Array(d);
    let idx = 0;
    let damp = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx];
      damp = y * 0.6 + damp * 0.4;
      buf[idx] = input[i] + damp * 0.82;
      out[i] += y / combMs.length;
      idx = (idx + 1) % d;
    }
  }
  for (const ms of apMs) {
    const d = Math.floor((ms / 1000) * SR);
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < N; i++) {
      const b = buf[idx];
      const x = out[i];
      const y = -x + b;
      buf[idx] = x + b * 0.5;
      out[i] = y;
      idx = (idx + 1) % d;
    }
  }
  return out;
}
const revL = reverb(sendL, [29.7, 37.1, 41.1, 43.7], [5.0, 1.7]);
const revR = reverb(sendR, [30.9, 36.3, 42.3, 44.9], [5.3, 1.9]);
for (let i = 0; i < N; i++) {
  L[i] += revL[i] * 0.9;
  R[i] += revR[i] * 0.9;
}

// ---------- master: fades, saturação suave e normalização ----------
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.8) * (t > 75.5 ? Math.max(0, (DUR - t) / 3.5) : 1);
  L[i] = Math.tanh(L[i] * fade * 1.2);
  R[i] = Math.tanh(R[i] * fade * 1.2);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = 0.89 / peak;

const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const dir = new URL('../public/audio/', import.meta.url).pathname;
await mkdir(dir, { recursive: true });
await writeFile(`${dir}music.wav`, Buffer.concat([header, data]));
console.log(`trilha gerada: public/audio/music.wav (${DUR}s, pico normalizado)`);
