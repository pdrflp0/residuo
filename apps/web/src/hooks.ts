import { useCallback, useEffect, useRef, useState } from 'react';

// ---------- rota por hash (sem dependência de roteador) ----------

export type Route = { name: 'home' } | { name: 'run'; id: string } | { name: 'compare'; base: string; candidate: string };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'runs' && parts[1]) return { name: 'run', id: parts[1] };
  if (parts[0] === 'compare' && parts[1] && parts[2]) return { name: 'compare', base: parts[1], candidate: parts[2] };
  return { name: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (path: string) => {
  location.hash = path;
};

// ---------- busca com polling enquanto houver trabalho ----------

export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[], keepPolling?: (data: T) => boolean, intervalMs = 350) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<Error | undefined>();
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const pollRef = useRef(keepPolling);
  pollRef.current = keepPolling;

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    setLoading(true);
    setError(undefined);
    const tick = async () => {
      try {
        const d = await fetcher();
        if (cancelled) return;
        setData(d);
        setError(undefined);
        setLoading(false);
        if (pollRef.current?.(d)) timer = window.setTimeout(tick, intervalMs);
      } catch (e) {
        if (cancelled) return;
        setError(e as Error);
        setLoading(false);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

// ---------- preferência de movimento ----------

const MOTION_KEY = 'residuo:motion';

function readStoredMotion(): boolean | undefined {
  try {
    const v = localStorage.getItem(MOTION_KEY);
    return v === null ? undefined : v === 'on';
  } catch {
    return undefined;
  }
}

/** Animações ligadas, salvo preferência do sistema por movimento reduzido ou escolha do usuário. */
export function useMotion() {
  const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  const [systemReduced, setSystemReduced] = useState(media?.matches ?? false);
  const [stored, setStored] = useState<boolean | undefined>(readStoredMotion);

  useEffect(() => {
    if (!media) return;
    const on = () => setSystemReduced(media.matches);
    media.addEventListener('change', on);
    return () => media.removeEventListener('change', on);
  }, [media]);

  const enabled = stored ?? !systemReduced;
  useEffect(() => {
    document.documentElement.dataset.motion = enabled ? 'on' : 'off';
  }, [enabled]);

  const setEnabled = useCallback((v: boolean) => {
    setStored(v);
    try {
      localStorage.setItem(MOTION_KEY, v ? 'on' : 'off');
    } catch {
      /* armazenamento indisponível: vale só nesta sessão */
    }
  }, []);
  return { enabled, setEnabled };
}

// ---------- reprodução do registro gravado ----------

/**
 * Revela as observações uma a uma. É só apresentação: os dados já estão gravados.
 * Sem animação, tudo aparece de uma vez.
 */
export function usePlayback(total: number, animate: boolean, stepMs = 420) {
  const [revealed, setRevealed] = useState(animate ? 0 : total);
  const [playing, setPlaying] = useState(animate);

  useEffect(() => {
    if (!animate) {
      setRevealed(total);
      setPlaying(false);
    }
  }, [animate, total]);

  useEffect(() => {
    if (!playing) return;
    if (revealed >= total) return;
    const t = window.setTimeout(() => setRevealed((r) => Math.min(r + 1, total)), revealed === 0 ? 150 : stepMs);
    return () => window.clearTimeout(t);
  }, [playing, revealed, total, stepMs]);

  return {
    revealed: Math.min(revealed, total),
    playing: playing && revealed < total,
    play: () => {
      if (revealed >= total) setRevealed(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    skip: () => {
      setRevealed(total);
      setPlaying(false);
    },
    stepTo: (n: number) => {
      setPlaying(false);
      setRevealed(Math.max(0, Math.min(n, total)));
    },
  };
}
