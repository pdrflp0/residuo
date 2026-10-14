import type { StepObservation, Verdict } from '@residuo/contracts';
import { deriveCards, type CardState } from '../entity-state';
import { ToneIcon } from '../ui';

interface Props {
  entityId: string;
  steps: StepObservation[];
  revealed: number;
  verdict?: Verdict;
}

export function EntityCards({ entityId, steps, revealed, verdict }: Props) {
  const cards = deriveCards(steps, revealed, verdict);
  return (
    <div className="entities" aria-label={`Estado até a etapa ${revealed}`}>
      <Card name={entityId} label="Registro" card={cards.record} />
      <Card name="edição offline" label="Atualização pendente" card={cards.edit} />
      <Card name="exclusão" label="Política de exclusão" card={cards.deletion} />
    </div>
  );
}

function Card({ name, label, card }: { name: string; label: string; card: CardState }) {
  const toneClass = card.tone ? `tone tone-${card.tone}` : '';
  return (
    <div
      key={card.changedAt ?? 0}
      className={`entity ${toneClass} ${card.deleted ? 'is-deleted' : ''} ${card.changedAt ? 'flash' : ''}`}
      data-tone={card.tone}
    >
      <div className="entity-top">
        <span className="eyebrow">{label}</span>
        <span className="entity-name">{name}</span>
      </div>
      <div className="entity-state">
        {card.tone && <ToneIcon tone={card.tone} size={17} />}
        <span>{card.state}</span>
      </div>
      <div className="entity-sub mono">{card.sub}</div>
      {card.source && <div className="entity-sub">{card.source}</div>}
    </div>
  );
}
