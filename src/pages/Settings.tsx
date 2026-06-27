import { useState } from 'react';
import { FullCaseBundleExport } from '../components/FullCaseBundleExport';
import { useSystem } from '../hooks/useSystem';

export default function Settings() {
  const { clearRuntimeCache, rebuildAllDocuments } = useSystem();
  const [message, setMessage] = useState('');

  async function run(action: 'cache' | 'rebuild') {
    const result = action === 'cache' ? await clearRuntimeCache() : await rebuildAllDocuments();
    setMessage(`${action} completed at ${result.timestamp_utc}`);
  }

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
        <p>Runtime maintenance and local export actions.</p>
      </div>
      <div className="card">
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => run('cache')}>Clear Runtime Cache</button>
          <button className="btn btn-ghost" onClick={() => run('rebuild')}>Rebuild Documents</button>
        </div>
        {message && <div className="hash-display" style={{ marginTop: 12 }}>{message}</div>}
      </div>
      <FullCaseBundleExport />
    </div>
  );
}
