import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { AlertTriangle, CalendarPlus, Eye, Trash2 } from 'lucide-react';
import { useEvidenceStore } from '../hooks/useStore';
import { useToast } from '../hooks/useToast';
import { classNames, formatDate, formatDateTime } from '../utils/helpers';
import Modal from '../components/Modal';
import type { Evidence, Incident } from '../types';

const INCIDENT_TYPES = [
  { value: 'denied_visit', label: 'Denied Visit' },
  { value: 'communication', label: 'Communication' },
  { value: 'support', label: 'Support' },
  { value: 'medical', label: 'Medical' },
  { value: 'school', label: 'School' },
  { value: 'other', label: 'Other' },
] as const;

const initialForm = {
  type: 'denied_visit' as Incident['type'],
  title: '',
  date: '',
  location: '',
  description: '',
  deniedVisitScheduledStart: '',
  deniedVisitScheduledEnd: '',
  deniedVisitArrivalTime: '',
  deniedVisitExchangeLocation: '',
  deniedVisitWhoDenied: '',
  deniedVisitChildPresent: '',
  deniedVisitReasonGiven: '',
  deniedVisitAttemptedContact: '',
  linkedEvidenceIds: [] as string[],
  linkedCommunicationIds: [] as string[],
};

export default function Incidents() {
  const { items: evidence } = useEvidenceStore();
  const { show } = useToast();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    loadIncidents();
  }, []);

  async function loadIncidents() {
    const rows = await invoke<Incident[]>('get_incidents');
    setIncidents(rows);
  }

  function toggleEvidence(id: string) {
    const exists = form.linkedEvidenceIds.includes(id);
    setForm({
      ...form,
      linkedEvidenceIds: exists
        ? form.linkedEvidenceIds.filter(value => value !== id)
        : [...form.linkedEvidenceIds, id],
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;

    const saved = await invoke<Incident>('create_incident', {
      input: {
        ...form,
        date: form.date || new Date().toISOString().split('T')[0],
      },
    });
    setIncidents(prev => [saved, ...prev]);
    setForm(initialForm);
    setIsModalOpen(false);
    show('Incident recorded and timeline entry created');
  }

  async function removeIncident(id: string) {
    await invoke('delete_incident', { id });
    setIncidents(prev => prev.filter(item => item.id !== id));
    show('Incident removed');
  }

  function riskClass(risk: Incident['trustGlyphRisk']) {
    if (risk === 'high') return 'badge-red';
    if (risk === 'medium') return 'badge-amber';
    return 'badge-green';
  }

  function evidenceLabel(item: Evidence) {
    return `${item.title} (${item.sha256.slice(0, 8)})`;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Incident Intake</h2>
        <p>Create incidents, denied visit records, linked evidence, and timeline entries.</p>
      </div>

      <div className="search-bar">
        <AlertTriangle size={18} color="var(--text-muted)" />
        <input value="Incident Intake + Denied Visit Log" readOnly />
        <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>
          <CalendarPlus size={16} /> New Incident
        </button>
      </div>

      <div className="card">
        {incidents.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle size={48} />
            <p>No incidents recorded yet.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Evidence</th>
                  <th>TrustGlyph</th>
                  <th style={{ width: 150 }}></th>
                </tr>
              </thead>
              <tbody>
                {incidents.map(item => (
                  <tr key={item.id}>
                    <td>{formatDate(item.date)}</td>
                    <td><span className="badge badge-blue">{item.type.replace('_', ' ')}</span></td>
                    <td>{item.title}</td>
                    <td>{item.linkedEvidenceIds.length}</td>
                    <td><span className={classNames('badge', riskClass(item.trustGlyphRisk))}>{item.trustGlyphRisk}</span></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIncident(item)}>
                        <Eye size={14} /> View
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeIncident(item.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="New Incident"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit}>Create Incident</button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label>Incident Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as Incident['type'] })}>
              {INCIDENT_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Title</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g., Denied exchange at school pickup" />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Location</label>
            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Exchange location or relevant place" />
          </div>

          {form.type === 'denied_visit' && (
            <>
              <div className="form-group">
                <label>Scheduled Start</label>
                <input type="time" value={form.deniedVisitScheduledStart} onChange={e => setForm({ ...form, deniedVisitScheduledStart: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Scheduled End</label>
                <input type="time" value={form.deniedVisitScheduledEnd} onChange={e => setForm({ ...form, deniedVisitScheduledEnd: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Arrival Time</label>
                <input type="time" value={form.deniedVisitArrivalTime} onChange={e => setForm({ ...form, deniedVisitArrivalTime: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Exchange Location</label>
                <input value={form.deniedVisitExchangeLocation} onChange={e => setForm({ ...form, deniedVisitExchangeLocation: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Who Denied</label>
                <input value={form.deniedVisitWhoDenied} onChange={e => setForm({ ...form, deniedVisitWhoDenied: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Child Present</label>
                <select value={form.deniedVisitChildPresent} onChange={e => setForm({ ...form, deniedVisitChildPresent: e.target.value })}>
                  <option value="">Unknown</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Reason Given</label>
                <textarea value={form.deniedVisitReasonGiven} onChange={e => setForm({ ...form, deniedVisitReasonGiven: e.target.value })} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Attempted Contact / Mitigation</label>
                <textarea value={form.deniedVisitAttemptedContact} onChange={e => setForm({ ...form, deniedVisitAttemptedContact: e.target.value })} />
              </div>
            </>
          )}

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Neutral facts only." />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Link Evidence / Communication Records</label>
            <div className="table-container">
              <table>
                <tbody>
                  {evidence.map(item => (
                    <tr key={item.id}>
                      <td style={{ width: 40 }}>
                        <input
                          type="checkbox"
                          checked={form.linkedEvidenceIds.includes(item.id)}
                          onChange={() => toggleEvidence(item.id)}
                        />
                      </td>
                      <td>{evidenceLabel(item)}</td>
                      <td><span className="badge badge-blue">{item.type}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(selectedIncident)}
        onClose={() => setSelectedIncident(null)}
        title="Incident Detail"
        footer={<button className="btn btn-primary" onClick={() => setSelectedIncident(null)}>Close</button>}
      >
        {selectedIncident && (
          <div className="form-grid">
            <div className="form-group">
              <label>Incident ID</label>
              <input value={selectedIncident.id} readOnly />
            </div>
            <div className="form-group">
              <label>Timeline Event ID</label>
              <input value={selectedIncident.timelineEventId} readOnly />
            </div>
            <div className="form-group">
              <label>Created</label>
              <input value={formatDateTime(selectedIncident.createdAt)} readOnly />
            </div>
            <div className="form-group">
              <label>TrustGlyph</label>
              <input value={selectedIncident.trustGlyphRisk} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Court-Safe Summary</label>
              <textarea value={selectedIncident.courtSafeSummary} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Linked Evidence IDs</label>
              <div className="hash-display">{selectedIncident.linkedEvidenceIds.join(', ') || 'None linked'}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
