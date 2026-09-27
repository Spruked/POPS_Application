import { useState } from 'react';
import { useSystem } from '../hooks/useSystem';
import type { FullCaseBundleReceipt } from '../types';

export function FullCaseBundleExport({ caseId = 'default' }: { caseId?: string }) {
  const { exportFullCaseBundle } = useSystem();
  const [receipt, setReceipt] = useState<FullCaseBundleReceipt | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  async function handleExport() {
    setWorking(true);
    setError('');
    try {
      setReceipt(await exportFullCaseBundle(caseId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Full Case Bundle</h3>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Exports the case summary, evidence, timeline, legal records, contacts, reports, integrity records, and manifest together.</p>
      <button className="btn btn-primary" onClick={handleExport} disabled={working}>
        {working ? 'Building Bundle...' : 'Export Full Case Bundle'}
      </button>
      {receipt && <div className="hash-display" style={{ marginTop: 12 }}>{receipt.bundle_path}</div>}
      {error && <div className="hash-display" style={{ marginTop: 12, color: 'var(--accent-red)' }}>{error}</div>}
    </div>
  );
}
