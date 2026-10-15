import type { AdapterDescriptor, AiSummary, Mode, Run, RunComparison, RunConfigInput, RunDetail, ScenarioSummary } from '@residuo/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : {},
    });
  } catch {
    throw new ApiError(0, 'Não foi possível falar com a API do Resíduo. Ela está no ar?');
  }
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    const msg =
      typeof body?.message === 'string'
        ? body.message
        : res.status >= 502 && res.status <= 504
          ? `A API do Resíduo não respondeu (HTTP ${res.status}). Ela está no ar?`
          : `Erro HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export interface About {
  engineVersion: string;
  adapter: AdapterDescriptor;
  reference: { reachable: boolean; version?: string };
  ai: { enabled: boolean; model: string };
}

export const getAbout = () => api<About>('/about');
export const getScenarios = () => api<{ defaultSeed: number; scenarios: ScenarioSummary[] }>('/scenarios');
export const listRuns = (limit = 12) => api<Run[]>(`/runs?limit=${limit}`);
export const getRun = (id: string) => api<RunDetail>(`/runs/${id}`);
export const createRun = (input: RunConfigInput) => api<Run>('/runs', { method: 'POST', body: JSON.stringify(input) });
export const advanceRun = (id: string) => api<{ advanced: boolean }>(`/runs/${id}/advance`, { method: 'POST' });
export const replayRun = (id: string) => api<Run>(`/runs/${id}/replay`, { method: 'POST' });
export const counterpartRun = (id: string, mode: Mode) => api<Run>(`/runs/${id}/counterpart`, { method: 'POST', body: JSON.stringify({ mode }) });
export const summarizeRun = (id: string, refresh = false) => api<AiSummary>(`/runs/${id}/summary${refresh ? '?refresh=1' : ''}`, { method: 'POST' });
export const getComparison = (base: string, candidate: string) =>
  api<{ comparison: RunComparison; base: RunDetail; candidate: RunDetail }>(`/comparisons?base=${base}&candidate=${candidate}`);

export const reportUrl = (id: string, kind: 'json' | 'md' | 'html') => `/api/runs/${id}/report.${kind}`;
export const regressionUrl = (id: string) => `/api/runs/${id}/regression.test.ts`;

export const isFinished = (run: Run) => run.status === 'completed' || run.status === 'interrupted';
