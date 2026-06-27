import type { SmartDocumentEvent } from '../types';

interface Props {
  history: SmartDocumentEvent[];
}

export function DerivedHistoryPanel({ history }: Props) {
  return (
    <div className="pops-history-panel">
      {history.map((event) => (
        <div key={event.eventId}>
          <strong>{event.actionType}</strong>
          <span>{event.effectiveStatus}</span>
        </div>
      ))}
    </div>
  );
}
