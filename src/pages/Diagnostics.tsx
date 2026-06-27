import { useEffect, useState } from 'react';
import { useSystem } from '../hooks/useSystem';
import type { DiagnosticsReport } from '../types';

export default function Diagnostics() {
  const { getDiagnostics } = useSystem();
  const [report, setReport] = useState<DiagnosticsReport | null>(null);

  useEffect(() => {
    getDiagnostics().then(setReport).catch(() => setReport(null));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h2>Diagnostics</h2>
        <p>Local runtime, database, and record counts.</p>
      </div>
      <div className="card">
        {report ? (
          <div className="stats-grid">
            <div className="stat-card"><h4>Documents</h4><div className="value">{report.total_documents}</div></div>
            <div className="stat-card"><h4>Events</h4><div className="value">{report.total_events}</div></div>
            <div className="stat-card"><h4>Evidence</h4><div className="value">{report.total_evidence}</div></div>
            <div className="stat-card"><h4>Version</h4><div className="value">{report.app_version}</div></div>
          </div>
        ) : (
          <p>Diagnostics unavailable.</p>
        )}
        {report && <div className="hash-display">{report.db_path}</div>}
      </div>
    </div>
  );
}
