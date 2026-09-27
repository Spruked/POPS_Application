import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useSystem } from '../hooks/useSystem';
import type { DiagnosticsReport } from '../types';

export default function Diagnostics() {
  const { getDiagnostics } = useSystem();
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [localStatus, setLocalStatus] = useState<{ substrate_available: boolean; substrate_root: string; services: Array<{ name: string; status: string; detail: string }> } | null>(null);

  useEffect(() => {
    getDiagnostics().then(setReport).catch(() => setReport(null));
    invoke<typeof localStatus>('local_agent_status').then(setLocalStatus).catch(() => setLocalStatus(null));
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
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3>Local Model Services</h3>
        </div>
        {localStatus ? (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Substrate: {localStatus.substrate_available ? 'available' : 'not found'} — {localStatus.substrate_root}</p>
            <div className="table-container">
              <table>
                <thead><tr><th>Service</th><th>Status</th><th>Detail</th></tr></thead>
                <tbody>{localStatus.services.map((service) => <tr key={service.name}><td>{service.name}</td><td><span className={`badge ${service.status === 'online' ? 'badge-green' : 'badge-amber'}`}>{service.status}</span></td><td>{service.detail}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        ) : <p>Local model diagnostics unavailable.</p>}
      </div>
    </div>
  );
}
