import { useEffect, useState } from 'react';
import { useCase } from '../hooks/useCase';
import type { CaseSummary } from '../types';

export function CaseOverview() {
  const { getCaseOverview } = useCase();
  const [items, setItems] = useState<CaseSummary[]>([]);

  useEffect(() => {
    getCaseOverview().then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <div className="pops-case-overview">
      {items.map((item) => (
        <div key={item.case_id}>
          <strong>{item.case_id}</strong>
          <span>{item.evidence_count} evidence</span>
        </div>
      ))}
    </div>
  );
}
