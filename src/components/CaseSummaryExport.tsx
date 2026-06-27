import { useExport } from '../hooks/useExport';

export function CaseSummaryExport({ caseId }: { caseId: string }) {
  const { exportAttorneyPacket } = useExport();

  return (
    <div className="pops-case-summary-export">
      <button className="btn btn-ghost btn-sm" onClick={() => exportAttorneyPacket(caseId)}>
        Export Case Summary
      </button>
    </div>
  );
}
