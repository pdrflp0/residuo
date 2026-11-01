const SENSITIVE_KEY = /(authorization|token|secret|password|passwd|cookie|api[-_]?key|credential)/i;

export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[profundidade máxima]';
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) && typeof v === 'string' ? '[redacted]' : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}
