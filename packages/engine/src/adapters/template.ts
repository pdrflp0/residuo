/**
 * Modelos {{variável}} do residuo.json e extração de fatos das respostas.
 * Pequeno de propósito: caminhos com ponto ("item.generation", "items.0.id") em vez de JSONPath completo.
 */
import type { FactRule } from '@residuo/contracts';

export type Vars = Record<string, unknown>;

const WHOLE = /^\{\{\s*([\w.$-]+)\s*\}\}$/;
const INLINE = /\{\{\s*([\w.$-]+)\s*\}\}/g;

export class TemplateError extends Error {}

export function lookup(source: unknown, path: string): unknown {
  let cur: unknown = source;
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function need(vars: Vars, name: string): unknown {
  const v = lookup(vars, name);
  if (v === undefined) throw new TemplateError(`variável {{${name}}} não está definida`);
  return v;
}

/** Corpo JSON: "{{x}}" sozinho vira o valor tipado; dentro de um texto, é interpolado. */
export function render(value: unknown, vars: Vars): unknown {
  if (typeof value === 'string') {
    const whole = value.match(WHOLE);
    if (whole) return need(vars, whole[1]!);
    return value.replace(INLINE, (_, name: string) => String(need(vars, name)));
  }
  if (Array.isArray(value)) return value.map((v) => render(v, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, render(v, vars)]));
  }
  return value;
}

/** Caminho de URL: cada valor interpolado é codificado. */
export function renderPath(path: string, vars: Vars): string {
  return path.replace(INLINE, (_, name: string) => encodeURIComponent(String(need(vars, name))));
}

/** Aplica uma regra de fato à resposta. "$status" é o código HTTP. */
export function extract(rule: FactRule | undefined, body: unknown, status: number): unknown {
  if (rule === undefined) return undefined;
  const read = (path: string) => (path === '$status' ? status : lookup(body, path));
  if (typeof rule === 'string') return read(rule);
  const value = read(rule.path);
  if (rule.in) return rule.in.some((x) => x === value);
  if ('equals' in rule) return value === rule.equals;
  return value;
}

export const asNumber = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

export const asString = (v: unknown): string | undefined => (v === undefined || v === null ? undefined : String(v));
