import type { Lane, StepObservation, VerdictResult } from '@residuo/contracts';
import type { Tone } from '@residuo/engine/narrative';
import {
  ArchiveRestore,
  BadgeCheck,
  Ban,
  CircleDashed,
  CircleDot,
  CircleHelp,
  Eye,
  Ghost,
  Inbox,
  type LucideIcon,
  MinusCircle,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  WifiOff,
} from 'lucide-react';

export const TONE_ICON: Record<Tone, LucideIcon> = {
  live: CircleDot,
  deleted: Trash2,
  conflict: Ban,
  reappeared: Ghost,
  new: Sparkles,
  restored: ArchiveRestore,
  neutral: Send,
  failure: CircleHelp,
  skipped: MinusCircle,
};

export const TONE_LABEL: Record<Tone, string> = {
  live: 'vivo',
  deleted: 'excluído',
  conflict: 'rejeitado explicitamente',
  reappeared: 'reapareceu',
  new: 'nova geração',
  restored: 'restaurado',
  neutral: 'em trânsito',
  failure: 'sem evidência',
  skipped: 'não executado',
};

export const LANES: { id: Lane; name: string; sub: string; icon: LucideIcon }[] = [
  { id: 'api', name: 'API', sub: 'escritas no alvo', icon: Server },
  { id: 'client', name: 'Cliente offline', sub: 'prepara e retém', icon: WifiOff },
  { id: 'consumer', name: 'Consumidor', sub: 'fila de entregas', icon: Inbox },
  { id: 'observer', name: 'Observador', sub: 'leituras do Resíduo', icon: Eye },
];

export const VERDICT_META: Record<VerdictResult, { label: string; tone: Tone; icon: LucideIcon }> = {
  VIOLATION: { label: 'Violação: o registro excluído voltou', tone: 'reappeared', icon: Ghost },
  NO_VIOLATION_OBSERVED: { label: 'Nenhuma violação observada', tone: 'live', icon: ShieldCheck },
  INCONCLUSIVE: { label: 'Inconclusivo', tone: 'failure', icon: CircleHelp },
  POLICY_ALLOWED: { label: 'Permitido pela política', tone: 'new', icon: BadgeCheck },
};

export const MODE_LABEL = { vulnerable: 'vulnerable — upsert sem marcador', guarded: 'guarded — marcador por geração' } as const;
export const POLICY_LABEL = { 'delete-wins': 'exclusão prevalece', 'explicit-restore': 'restauração explícita permitida' } as const;
export const FAULT_LABEL = {
  none: 'nenhuma',
  'confirm-unavailable': 'confirmação indisponível (503)',
  'confirm-pending': 'confirmação nunca fica efetiva',
  'inspect-hang': 'leitura sem resposta (timeout)',
} as const;

export function ToneIcon({ tone, size = 16 }: { tone: Tone; size?: number }) {
  const Icon = TONE_ICON[tone];
  return <Icon size={size} aria-hidden="true" strokeWidth={2} />;
}

export function VerdictChip({ result }: { result?: VerdictResult }) {
  if (!result) {
    return (
      <span className="chip tone tone-neutral">
        <CircleDashed size={13} aria-hidden="true" /> em andamento
      </span>
    );
  }
  const m = VERDICT_META[result];
  const Icon = m.icon;
  return (
    <span className={`chip tone tone-${m.tone}`}>
      <Icon size={13} aria-hidden="true" /> {result}
    </span>
  );
}

/** Rótulo curto exibido no nó da linha do tempo: código HTTP + resultado. */
export function stepCode(o: StepObservation): string {
  if (o.status === 'skipped') return 'não executada';
  if (o.status === 'timeout') return 'timeout';
  if (o.status !== 'ok') return `${o.exchange?.response?.status ?? '—'} · falha`;
  const http = o.exchange?.response?.status ?? '';
  const f = o.facts;
  if (o.kind === 'inspect') return f.visible ? `${http} · g${f.observedGeneration} r${f.observedRevision}` : `${http} · ausente`;
  if (o.kind === 'confirm-deletion') return `${http} · ${f.confirmationStatus ?? '?'}`;
  return `${http} · ${f.writeOutcome ?? '?'}`;
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `há ${Math.max(s, 1)} s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}
