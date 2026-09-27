import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { GitBranch, Link2, RefreshCcw, ShieldCheck } from 'lucide-react';
import { formatDateTime } from '../utils/helpers';
import type { GlyphTraceSummary } from '../types';

const STATE_CLASS: Record<string, string> = {
  Verified: 'badge-green',
  'Vault Protected': 'badge-green',
  'Chain Complete': 'badge-green',
  'Needs Document': 'badge-amber',
  Approximate: 'badge-amber',
  Disputed: 'badge-red',
  'Review Needed': 'badge-amber',
  'Forensic Review': 'badge-red',
  'Integrity Warning': 'badge-red',
};

export default function GlyphTrace() {
  const [records, setRecords] = useState<GlyphTraceSummary[]>([]);
  const [filter, setFilter] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setLoaded(false);
    const items = await invoke<GlyphTraceSummary[]>('get_glyph_trace_records');
    setRecords(items);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) => [
      record.glyphTraceId,
      record.recordType,
      record.title,
      record.status,
      record.verificationState,
      record.vaultPath,
      record.linkedRecordIds.join(' '),
    ].join(' ').toLowerCase().includes(term));
  }, [filter, records]);

  const byType = useMemo(() => {
    return records.reduce<Record<string, number>>((all, record) => {
      all[record.recordType] = (all[record.recordType] || 0) + 1;
      return all;
    }, {});
  }, [records]);

  return (
    <div>
      <div className="page-header">
        <h2>Glyph Trace</h2>
        <p>Auditable navigation across Vault-backed records, links, states, and history paths.</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Traceable Records</div>
          <div className="stat-value">{records.length}</div>
          <div className="stat-delta">Loaded from Vault-backed database tables</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Vault Protected</div>
          <div className="stat-value">{records.filter((record) => record.verificationState.includes('Vault')).length}</div>
          <div className="stat-delta">Current state has Vault path</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Record Types</div>
          <div className="stat-value">{Object.keys(byType).length}</div>
          <div className="stat-delta">Evidence, legal, events, reports, and module records</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitBranch size={18} /> Trace Graph
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={() => void load()}>
            <RefreshCcw size={14} /> Refresh
          </button>
        </div>

        <div className="search-bar">
          <ShieldCheck size={18} color="var(--text-muted)" />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search glyph, record type, state, title, link, or Vault path..." />
        </div>

        {!loaded ? (
          <div className="empty-state"><p>Loading Glyph Trace records...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><p>No trace records match the current filter.</p></div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Glyph</th>
                  <th>Record</th>
                  <th>State</th>
                  <th>Links</th>
                  <th>Vault Path</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr key={`${record.recordType}-${record.recordId}`}>
                    <td><code>{record.glyphTraceId}</code></td>
                    <td>
                      <strong>{record.title}</strong>
                      <div>{record.recordType}</div>
                      <div>{record.recordId}</div>
                    </td>
                    <td>
                      <span className="badge badge-blue">{record.status}</span>
                      <span className={`badge ${STATE_CLASS[record.verificationState] || 'badge-amber'}`} style={{ marginLeft: 6 }}>
                        {record.verificationState}
                      </span>
                    </td>
                    <td>
                      {record.linkedRecordIds.length ? record.linkedRecordIds.map((id) => (
                        <span className="badge badge-green" key={id} style={{ marginRight: 4 }}>
                          <Link2 size={11} /> {id}
                        </span>
                      )) : 'None'}
                    </td>
                    <td><div className="hash-display">{record.vaultPath}</div></td>
                    <td>{formatDateTime(record.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
