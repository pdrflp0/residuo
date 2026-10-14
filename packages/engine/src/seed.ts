/**
 * A semente gera somente os dados sintéticos (id do registro e conteúdo das edições).
 * A ordem das etapas vem do cenário e das barreiras, não da semente nem do relógio.
 */
/** Semente padrão da demonstração: gera o registro `item-17` do exemplo de referência. */
export const DEFAULT_SEED = 1200;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TITLES = ['Ficha de atendimento', 'Pedido de compra', 'Cadastro de fornecedor', 'Nota de visita', 'Ordem de serviço'];
const EDITS = ['corrigir telefone', 'atualizar endereço', 'mudar responsável', 'acrescentar observação', 'ajustar prazo'];

export interface SyntheticData {
  entityId: string;
  initial: Record<string, unknown>;
  edit: Record<string, unknown>;
}

export function syntheticData(seed: number): SyntheticData {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const n = 1 + Math.floor(rnd() * 99);
  const title = pick(TITLES);
  return {
    entityId: `item-${n}`,
    initial: { title, note: 'dado sintético de demonstração' },
    edit: { title, note: `edição offline: ${pick(EDITS)}` },
  };
}
