import { z } from 'zod';
import { VERDICTS } from './domain';

/**
 * Resumo de uma execução escrito por IA (opcional, nível 3).
 *
 * Não decide nada: o veredito vem do avaliador determinístico. O resumo só é aceito se repetir
 * esse veredito e se cada afirmação citar etapas que existem na execução (ver engine/ai-summary).
 */
export const AiSummaryItem = z.object({
  text: z.string().describe('Uma afirmação curta, em português do Brasil.'),
  steps: z.array(z.number()).describe('Números (seq) das etapas que sustentam a afirmação.'),
});
export type AiSummaryItem = z.infer<typeof AiSummaryItem>;

/** O que o modelo devolve (saída estruturada). Limites de tamanho são conferidos depois, junto com as citações. */
export const AiSummaryOutput = z.object({
  verdict: z.enum(VERDICTS).describe('Cópia exata de verdict.result do relatório.'),
  headline: z.string().describe('Uma frase que resume o que aconteceu.'),
  findings: z.array(AiSummaryItem).describe('2 a 5 achados, cada um com as etapas citadas.'),
  nextSteps: z.array(AiSummaryItem).describe('Até 3 sugestões do que investigar ou corrigir, cada uma com as etapas que a motivam.'),
});
export type AiSummaryOutput = z.infer<typeof AiSummaryOutput>;

export interface AiSummary extends AiSummaryOutput {
  schema: 'residuo.ai-summary/v1';
  runId: string;
  model: string;
  createdAt: string;
  usage?: { inputTokens: number; outputTokens: number };
}
