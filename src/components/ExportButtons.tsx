import { useExport } from '../hooks/useExport';

export function ExportButtons() {
  const { exportEvidenceIndex } = useExport();

  return (
    <div className="export-buttons">
      <button className="btn btn-ghost btn-sm" onClick={() => exportEvidenceIndex()}>
        Export Evidence Index
      </button>
    </div>
  );
}
