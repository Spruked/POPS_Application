import { useState } from 'react';
import { useSystem } from '../hooks/useSystem';
import type { FullCaseBundleReceipt } from '../types';

export function FullCaseBundleExport({ caseId = 'default' }: { caseId?: string }) {
  const { exportFullCaseBundle } = useSystem();
  const [receipt, setReceipt] = useState<FullCaseBundleReceipt | null>(null);

  async function handleExport() {
    setReceipt(await exportFullCaseBundle(caseId));
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Full Case Bundle</h3>
      </div>
      <button className="btn btn-primary" onClick={handleExport}>
        Export Bundle
      </button>
      {receipt && <div className="hash-display" style={{ marginTop: 12 }}>{receipt.bundle_path}</div>}
    </div>
  );
}
