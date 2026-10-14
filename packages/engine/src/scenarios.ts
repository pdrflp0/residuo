/**
 * Cenários como dados versionados. Mudou a sequência ou o significado de uma etapa,
 * muda a versão: relatórios antigos continuam apontando para a versão que realmente rodou.
 */
import type { Lane, Policy, ScenarioStepSummary, ScenarioSummary, StepKind } from '@residuo/contracts';

export interface StepParams {
  /** etapa cuja entrega (delivery) será liberada/reentregue */
  delivery?: string;
  /** etapa de exclusão a confirmar ou restaurar */
  deletion?: string;
  /** etapa de backup a restaurar */
  snapshot?: string;
  /** ponto de leitura de uma etapa inspect (padrão "primary") */
  point?: string;
}

export interface ScenarioStep extends ScenarioStepSummary {
  params?: StepParams;
}

export interface Scenario extends ScenarioSummary {
  steps: ScenarioStep[];
}

const step = (id: string, kind: StepKind, lane: Lane, title: string, plain: string, params?: StepParams): ScenarioStep => ({
  id,
  kind,
  lane,
  title,
  plain,
  ...(params ? { params } : {}),
});

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'held-update-after-delete',
    version: '1.0.0',
    title: 'Atualização retida chega depois da exclusão',
    summary:
      'Um cliente prepara uma edição a partir da revisão 1, o envio fica retido, outro cliente exclui o registro e a edição antiga chega ao consumidor depois da exclusão confirmada.',
    defaultPolicy: 'delete-wins',
    story: ['O registro foi criado.', 'Foi apagado e a exclusão foi confirmada.', 'Chegou uma atualização antiga.', 'O registro voltou?'],
    steps: [
      step('create', 'create', 'api', 'Criar registro', 'A API cria a ficha.'),
      step('prepare', 'prepare-update', 'client', 'Preparar edição offline', 'Um cliente edita a ficha a partir da revisão atual.'),
      step('hold', 'hold', 'client', 'Reter envio', 'O envio fica preso (fila parada ou aparelho offline).', { delivery: 'prepare' }),
      step('inspect-before', 'inspect', 'observer', 'Ler estado inicial', 'O Resíduo lê o registro para ter uma linha de base.'),
      step('delete', 'delete', 'api', 'Excluir registro', 'Outro cliente pede a exclusão.'),
      step('confirm', 'confirm-deletion', 'api', 'Confirmar exclusão', 'O serviço confirma que a exclusão está em vigor.', { deletion: 'delete' }),
      step('inspect-deleted', 'inspect', 'observer', 'Ler após exclusão', 'O Resíduo verifica que o registro sumiu.'),
      step('release', 'release', 'consumer', 'Liberar edição antiga', 'A edição retida finalmente chega ao consumidor.', { delivery: 'prepare' }),
      step('inspect-after', 'inspect', 'observer', 'Ler estado final', 'O Resíduo lê o registro de novo: ele voltou?'),
    ],
  },
  {
    id: 'replay-after-delete',
    version: '1.0.0',
    title: 'Replay da mesma atualização após exclusão',
    summary:
      'Uma edição é entregue normalmente; depois o registro é excluído e a mesma mensagem é entregue de novo (entrega "pelo menos uma vez").',
    defaultPolicy: 'delete-wins',
    story: ['Uma edição foi aplicada.', 'O registro foi apagado.', 'A mesma edição chegou de novo.', 'O registro voltou?'],
    steps: [
      step('create', 'create', 'api', 'Criar registro', 'A API cria a ficha.'),
      step('prepare', 'prepare-update', 'client', 'Preparar edição', 'Um cliente edita a ficha a partir da revisão atual.'),
      step('release', 'release', 'consumer', 'Entregar edição', 'A edição chega ao consumidor e é aplicada.', { delivery: 'prepare' }),
      step('inspect-before', 'inspect', 'observer', 'Ler após edição', 'O Resíduo lê o registro editado.'),
      step('delete', 'delete', 'api', 'Excluir registro', 'Um cliente pede a exclusão.'),
      step('confirm', 'confirm-deletion', 'api', 'Confirmar exclusão', 'O serviço confirma que a exclusão está em vigor.', { deletion: 'delete' }),
      step('inspect-deleted', 'inspect', 'observer', 'Ler após exclusão', 'O Resíduo verifica que o registro sumiu.'),
      step('replay', 'replay', 'consumer', 'Reentregar a mesma edição', 'A fila entrega a mesma mensagem outra vez.', { delivery: 'prepare' }),
      step('inspect-after', 'inspect', 'observer', 'Ler estado final', 'O Resíduo lê o registro de novo: ele voltou?'),
    ],
  },
  {
    id: 'new-generation-control',
    version: '1.0.0',
    title: 'Controle: nova geração criada explicitamente',
    summary:
      'Depois da exclusão confirmada, alguém cria de novo um registro com o mesmo id. Isso é uma nova geração legítima e não deve ser confundido com a antiga ressuscitada.',
    defaultPolicy: 'delete-wins',
    story: ['O registro foi criado.', 'Foi apagado e a exclusão foi confirmada.', 'Alguém criou um registro novo com o mesmo id.', 'É o antigo ou um novo?'],
    steps: [
      step('create', 'create', 'api', 'Criar registro', 'A API cria a ficha (geração 1).'),
      step('delete', 'delete', 'api', 'Excluir registro', 'Um cliente pede a exclusão.'),
      step('confirm', 'confirm-deletion', 'api', 'Confirmar exclusão', 'O serviço confirma que a exclusão está em vigor.', { deletion: 'delete' }),
      step('inspect-deleted', 'inspect', 'observer', 'Ler após exclusão', 'O Resíduo verifica que o registro sumiu.'),
      step('recreate', 'create', 'api', 'Criar de novo, explicitamente', 'A API cria uma ficha nova com o mesmo id.'),
      step('inspect-after', 'inspect', 'observer', 'Ler estado final', 'O Resíduo lê o registro: qual geração está visível?'),
    ],
  },
  {
    id: 'authorized-restore',
    version: '1.0.0',
    title: 'Restauração autorizada',
    summary:
      'Um operador restaura explicitamente o registro excluído, com autorização registrada. O resultado depende da política declarada: permitido em "restauração explícita", violação em "exclusão prevalece".',
    defaultPolicy: 'explicit-restore',
    story: ['O registro foi criado.', 'Foi apagado e a exclusão foi confirmada.', 'Um operador autorizado restaurou o registro.', 'A política permite isso?'],
    steps: [
      step('create', 'create', 'api', 'Criar registro', 'A API cria a ficha.'),
      step('delete', 'delete', 'api', 'Excluir registro', 'Um cliente pede a exclusão.'),
      step('confirm', 'confirm-deletion', 'api', 'Confirmar exclusão', 'O serviço confirma que a exclusão está em vigor.', { deletion: 'delete' }),
      step('inspect-deleted', 'inspect', 'observer', 'Ler após exclusão', 'O Resíduo verifica que o registro sumiu.'),
      step('restore', 'restore', 'api', 'Restaurar com autorização', 'Um operador restaura o registro e registra o motivo.', { deletion: 'delete' }),
      step('inspect-after', 'inspect', 'observer', 'Ler estado final', 'O Resíduo lê o registro: ele voltou, e com que autorização?'),
    ],
  },
  {
    id: 'backup-restore-after-delete',
    version: '1.0.0',
    title: 'Backup antigo restaurado depois da exclusão',
    summary:
      'Um backup é feito com o registro vivo. Depois o registro é excluído e a exclusão confirmada. Quando o backup é restaurado, o registro apagado volta junto?',
    defaultPolicy: 'delete-wins',
    story: ['Um backup foi feito.', 'O registro foi apagado e a exclusão confirmada.', 'Alguém restaurou o backup.', 'O registro apagado voltou junto?'],
    steps: [
      step('create', 'create', 'api', 'Criar registro', 'A API cria a ficha.'),
      step('snapshot', 'snapshot', 'ops', 'Fazer backup', 'A operação tira um backup com o registro ainda vivo.'),
      step('inspect-before', 'inspect', 'observer', 'Ler estado inicial', 'O Resíduo lê o registro para ter uma linha de base.'),
      step('delete', 'delete', 'api', 'Excluir registro', 'Um cliente pede a exclusão.'),
      step('confirm', 'confirm-deletion', 'api', 'Confirmar exclusão', 'O serviço confirma que a exclusão está em vigor.', { deletion: 'delete' }),
      step('inspect-deleted', 'inspect', 'observer', 'Ler após exclusão', 'O Resíduo verifica que o registro sumiu.'),
      step('restore-snapshot', 'restore-snapshot', 'ops', 'Restaurar o backup', 'A operação restaura o backup antigo (por exemplo, depois de um incidente).', { snapshot: 'snapshot' }),
      step('inspect-after', 'inspect', 'observer', 'Ler estado final', 'O Resíduo lê o registro: o backup trouxe o apagado de volta?'),
    ],
  },
  {
    id: 'derived-data-after-delete',
    version: '1.0.0',
    title: 'Cache e índice de busca depois da exclusão',
    summary:
      'O registro é lido pelo cache e aparece na busca. Depois da exclusão confirmada, ele some do banco, mas continua no cache ou no índice?',
    defaultPolicy: 'delete-wins',
    story: ['O registro foi lido pelo cache e indexado na busca.', 'Foi apagado e a exclusão confirmada.', 'O banco não o mostra mais.', 'E o cache e a busca?'],
    steps: [
      step('create', 'create', 'api', 'Criar registro', 'A API cria a ficha e a indexa na busca.'),
      step('warm-cache', 'inspect', 'observer', 'Ler pelo cache', 'Uma leitura passa pelo cache e o aquece.', { point: 'cache' }),
      step('search-before', 'inspect', 'observer', 'Buscar no índice', 'A ficha aparece no índice de busca.', { point: 'search' }),
      step('delete', 'delete', 'api', 'Excluir registro', 'Um cliente pede a exclusão.'),
      step('confirm', 'confirm-deletion', 'api', 'Confirmar exclusão', 'O serviço confirma que a exclusão está em vigor.', { deletion: 'delete' }),
      step('inspect-primary', 'inspect', 'observer', 'Ler no banco', 'O Resíduo lê a fonte de verdade.'),
      step('inspect-cache', 'inspect', 'observer', 'Ler pelo cache de novo', 'O Resíduo lê pelo cache: ele foi invalidado?', { point: 'cache' }),
      step('inspect-search', 'inspect', 'observer', 'Buscar no índice de novo', 'O Resíduo consulta a busca: a ficha saiu do índice?', { point: 'search' }),
    ],
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function summarizeScenario(s: Scenario): ScenarioSummary {
  return {
    id: s.id,
    version: s.version,
    title: s.title,
    summary: s.summary,
    defaultPolicy: s.defaultPolicy as Policy,
    story: s.story,
    steps: s.steps.map(({ id, kind, lane, title, plain }) => ({ id, kind, lane, title, plain })),
  };
}
