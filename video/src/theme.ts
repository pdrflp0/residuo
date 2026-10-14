import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

/** Mesma identidade visual do app: papel, tinta e tons semânticos. */
export const C = {
  paper: '#f5f3ee',
  paper2: '#efece5',
  panel: '#ffffff',
  ink: '#1b1a17',
  ink2: '#47453f',
  ink3: '#75726a',
  rule: '#e0dcd2',
  ruleStrong: '#cbc6ba',
  live: '#1d7350',
  liveBg: '#e5f1ea',
  deleted: '#5c5952',
  deletedBg: '#ebe8e1',
  conflict: '#9c5600',
  conflictBg: '#fbefd9',
  reappeared: '#b42318',
  reappearedBg: '#fde8e5',
  newer: '#2454a6',
  newerBg: '#e6eefb',
  failure: '#51508a',
  failureBg: '#ebeaf6',
  brandDot: '#e0533f',
};

export const SANS = '"IBM Plex Sans", system-ui, sans-serif';
export const MONO = '"IBM Plex Mono", ui-monospace, monospace';

const fonts: [string, string, string][] = [
  ['IBM Plex Sans', 'ibm-plex-sans-latin-400-normal.woff2', '400'],
  ['IBM Plex Sans', 'ibm-plex-sans-latin-500-normal.woff2', '500'],
  ['IBM Plex Sans', 'ibm-plex-sans-latin-600-normal.woff2', '600'],
  ['IBM Plex Sans', 'ibm-plex-sans-latin-700-normal.woff2', '700'],
  ['IBM Plex Mono', 'ibm-plex-mono-latin-400-normal.woff2', '400'],
  ['IBM Plex Mono', 'ibm-plex-mono-latin-500-normal.woff2', '500'],
];

export function loadFonts() {
  for (const [family, file, weight] of fonts) {
    void loadFont({ family, url: staticFile(`fonts/${file}`), weight });
  }
}

export const FPS = 30;
