import { useEffect, useState } from 'react';
import { FolderTree, Gavel, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import { useCase } from '../hooks/useCase';
import { useToast } from '../hooks/useToast';
import { generateId, formatDate } from '../utils/helpers';
import type { CaseAlert, CaseLifecycleStage, CaseMatter, CaseMatterType, CaseOverviewData } from '../types';

const CASE_TYPES: Array<[CaseMatterType, string]> = [
  ['administrative', 'Administrative / license'], ['domestic_violence', 'Domestic-violence matter'],
  ['protection_order', 'Protection / restraining order'], ['criminal', 'Criminal matter'], ['child_support', 'Child support'],
  ['juvenile_agency', 'Juvenile / agency matter'], ['appeal_civil', 'Appeal / related civil matter'], ['other', 'Other related matter'],
];
const LIFECYCLE: Array<[CaseLifecycleStage, string]> = [
  ['allegation', 'Allegation'], ['filing', 'Filed matter'], ['temporary_order', 'Temporary order'], ['hearing', 'Hearing'],
  ['finding_order', 'Final finding / order'], ['dismissed', 'Dismissed'], ['closed', 'Closed'],
];
const ALERT_TYPES: Array<[CaseAlert['alertType'], string]> = [
  ['order_entered', 'Order entered'], ['service_status', 'Service status'], ['expiration', 'Expiration'], ['hearing', 'Hearing'],
  ['prohibited_contact', 'Prohibited-contact terms'], ['distance_restriction', 'Distance / location restriction'],
  ['firearms_property', 'Firearms / property restriction'], ['modification_dismissal', 'Modification / dismissal'],
  ['parenting_time_conflict', 'Parenting-time conflict'], ['other', 'Other alert'],
];

function newMatter(): CaseMatter {
  const now = new Date().toISOString();
  return { id: generateId(), parentCaseId: 'primary', caseType: 'administrative', title: '', caseNumber: '', courtName: '', judgeName: '', status: 'active', lifecycleStage: 'allegation', openedDate: '', closedDate: '', nextDeadline: '', nextHearingDate: '', orderIds: [], evidenceIds: [], eventIds: [], documentIds: [], notes: '', createdAt: now, updatedAt: now };
}
function newAlert(): CaseAlert { return { id: generateId(), caseId: 'primary', alertType: 'hearing', severity: 'high', title: '', details: '', dueDate: '', resolved: false, createdAt: new Date().toISOString() }; }
function displayDate(value: string) { return value ? formatDate(value) : 'Not set'; }

export default function CaseOverview() {
  const api = useCase();
  const { show } = useToast();
  const [data, setData] = useState<CaseOverviewData | null>(null);
  const [matter, setMatter] = useState<CaseMatter | null>(null);
  const [alert, setAlert] = useState<CaseAlert | null>(null);
  const [editingPrimary, setEditingPrimary] = useState(false);

  async function load() { try { setData(await api.getCaseOverviewData()); } catch (error) { show(error instanceof Error ? error.message : String(error)); } }
  useEffect(() => { void load(); }, []);

  async function saveMatter() { if (!matter?.title.trim()) return; try { await api.saveCaseMatter(matter); setMatter(null); await load(); show('Related case saved'); } catch (error) { show(error instanceof Error ? error.message : String(error)); } }
  async function savePrimary() { if (!data) return; try { await api.saveCaseMatter(data.primaryCase); setEditingPrimary(false); await load(); show('Primary case saved'); } catch (error) { show(error instanceof Error ? error.message : String(error)); } }
  async function deleteMatter(item: CaseMatter) { if (!window.confirm(`Delete ${item.title}?`)) return; try { await api.deleteCaseMatter(item.id); await load(); show('Related case deleted'); } catch (error) { show(error instanceof Error ? error.message : String(error)); } }
  async function saveAlert() { if (!alert?.title.trim()) return; try { await api.saveCaseAlert(alert); setAlert(null); await load(); show('Case alert added'); } catch (error) { show(error instanceof Error ? error.message : String(error)); } }

  if (!data) return <div className="card empty-state"><FolderTree size={44} /><p>Loading case overview...</p></div>;
  const primary = data.primaryCase;
  const updatePrimary = (updates: Partial<CaseMatter>) => setData({ ...data, primaryCase: { ...primary, ...updates } });

  return <div>
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div><h2>Case Overview</h2><p>Primary custody case, related matters, orders, deadlines, cross-case records, and alerts.</p></div>
      <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-ghost" type="button" onClick={() => setAlert(newAlert())}><ShieldAlert size={16} /> Add Alert</button><button className="btn btn-primary" type="button" onClick={() => setMatter(newMatter())}><Plus size={16} /> Add Related Case</button></div>
    </div>

    <section className="card" style={{ borderLeft: '3px solid var(--accent-blue)' }}>
      <div className="card-header"><div><div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Primary Case</div><h3>{primary.title}</h3></div><span className="badge badge-blue">{primary.lifecycleStage}</span></div>
      <div className="stats-grid"><div className="stat-card"><h4>Related Matters</h4><div className="value">{data.relatedCases.length}</div></div><div className="stat-card"><h4>Active Orders</h4><div className="value">{data.activeOrderCount}</div></div><div className="stat-card"><h4>Upcoming Dates</h4><div className="value">{data.upcomingDeadlineCount}</div></div><div className="stat-card"><h4>Cross-Case Evidence</h4><div className="value">{data.crossCaseEvidenceCount}</div></div></div>
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditingPrimary(!editingPrimary)}>{editingPrimary ? 'Close Case Details' : 'Edit Primary Case'}</button>
      {editingPrimary && <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="form-group"><label>Case title</label><input value={primary.title} onChange={(event) => updatePrimary({ title: event.target.value })} /></div>
        <div className="form-group"><label>Case number</label><input value={primary.caseNumber} onChange={(event) => updatePrimary({ caseNumber: event.target.value })} /></div>
        <div className="form-group"><label>Court</label><input value={primary.courtName} onChange={(event) => updatePrimary({ courtName: event.target.value })} /></div>
        <div className="form-group"><label>Judge</label><input value={primary.judgeName} onChange={(event) => updatePrimary({ judgeName: event.target.value })} /></div>
        <div className="form-group"><label>Status</label><select value={primary.status} onChange={(event) => updatePrimary({ status: event.target.value as CaseMatter['status'] })}><option value="active">Active</option><option value="pending">Pending</option><option value="stayed">Stayed</option><option value="dismissed">Dismissed</option><option value="closed">Closed</option></select></div>
        <div className="form-group"><label>Lifecycle</label><select value={primary.lifecycleStage} onChange={(event) => updatePrimary({ lifecycleStage: event.target.value as CaseLifecycleStage })}>{LIFECYCLE.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
        <div className="form-group"><label>Next hearing</label><input type="date" value={primary.nextHearingDate} onChange={(event) => updatePrimary({ nextHearingDate: event.target.value })} /></div>
        <div className="form-group"><label>Next deadline</label><input type="date" value={primary.nextDeadline} onChange={(event) => updatePrimary({ nextDeadline: event.target.value })} /></div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Case notes</label><textarea value={primary.notes} onChange={(event) => updatePrimary({ notes: event.target.value })} /></div>
        <div><button className="btn btn-primary" type="button" onClick={() => void savePrimary()}>Save Primary Case</button></div>
      </div>}
    </section>

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginTop: 16 }}>
      <section className="card" style={{ marginBottom: 0 }}><div className="card-header"><h3><FolderTree size={17} /> Related Cases</h3></div>{data.relatedCases.length === 0 ? <div className="empty-state" style={{ padding: 18 }}><p>No related matters yet.</p></div> : data.relatedCases.map((item) => <article key={item.id} className="card" style={{ marginBottom: 10, padding: 13 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><strong>{item.title}</strong><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{CASE_TYPES.find(([value]) => value === item.caseType)?.[1] || item.caseType} · {item.caseNumber || 'No case number'}</div></div><button className="btn btn-ghost btn-sm" type="button" onClick={() => void deleteMatter(item)}><Trash2 size={14} /></button></div><div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="badge badge-blue">{item.lifecycleStage}</span><span className="badge badge-amber">{item.status}</span>{item.nextHearingDate && <span className="badge badge-green">Hearing {displayDate(item.nextHearingDate)}</span>}</div><div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{item.courtName || 'Court not entered'} {item.judgeName ? `· Judge ${item.judgeName}` : ''}</div><div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>{item.orderIds.length} orders · {item.evidenceIds.length} evidence links · {item.eventIds.length} events · {item.documentIds.length} documents</div></article>)}</section>
      <section className="card" style={{ marginBottom: 0 }}><div className="card-header"><h3><ShieldAlert size={17} /> Alerts</h3></div>{data.alerts.length === 0 ? <div className="empty-state" style={{ padding: 18 }}><p>No unresolved case alerts.</p></div> : data.alerts.map((item) => <article key={item.id} className="card" style={{ marginBottom: 10, padding: 13, borderLeft: `3px solid ${item.severity === 'critical' ? 'var(--accent-red)' : item.severity === 'high' ? 'var(--accent-amber)' : 'var(--accent-blue)'}` }}><strong>{item.title}</strong><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.alertType.replace(/_/g, ' ')} {item.dueDate ? `· ${displayDate(item.dueDate)}` : ''}</div><p style={{ marginTop: 8, fontSize: 13 }}>{item.details}</p><button className="btn btn-ghost btn-sm" type="button" onClick={() => void api.resolveCaseAlert(item.id).then(load)}>Resolve</button></article>)}</section>
    </div>
    <section className="card" style={{ marginTop: 16 }}><div className="card-header"><h3><Gavel size={17} /> Active Orders & Restrictions</h3></div><p style={{ color: 'var(--text-muted)' }}>{data.activeOrderCount} order records are stored. Protection-order alerts capture service, expiration, prohibited contact, distance, firearms/property, modification, dismissal, and parenting-time conflicts separately.</p></section>

    <Modal isOpen={Boolean(matter)} onClose={() => setMatter(null)} title="Add Related Case" footer={<><button className="btn btn-ghost" type="button" onClick={() => setMatter(null)}>Cancel</button><button className="btn btn-primary" type="button" onClick={() => void saveMatter()}>Save Related Case</button></>}>
      {matter && <div className="form-grid"><div className="form-group"><label>Matter type</label><select value={matter.caseType} onChange={(event) => setMatter({ ...matter, caseType: event.target.value as CaseMatterType })}>{CASE_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="form-group"><label>Title</label><input value={matter.title} onChange={(event) => setMatter({ ...matter, title: event.target.value })} /></div><div className="form-group"><label>Case number</label><input value={matter.caseNumber} onChange={(event) => setMatter({ ...matter, caseNumber: event.target.value })} /></div><div className="form-group"><label>Court</label><input value={matter.courtName} onChange={(event) => setMatter({ ...matter, courtName: event.target.value })} /></div><div className="form-group"><label>Judge</label><input value={matter.judgeName} onChange={(event) => setMatter({ ...matter, judgeName: event.target.value })} /></div><div className="form-group"><label>Lifecycle state</label><select value={matter.lifecycleStage} onChange={(event) => setMatter({ ...matter, lifecycleStage: event.target.value as CaseLifecycleStage })}>{LIFECYCLE.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="form-group"><label>Status</label><select value={matter.status} onChange={(event) => setMatter({ ...matter, status: event.target.value as CaseMatter['status'] })}><option value="active">Active</option><option value="pending">Pending</option><option value="stayed">Stayed</option><option value="dismissed">Dismissed</option><option value="closed">Closed</option></select></div><div className="form-group"><label>Next hearing</label><input type="date" value={matter.nextHearingDate} onChange={(event) => setMatter({ ...matter, nextHearingDate: event.target.value })} /></div><div className="form-group"><label>Next deadline</label><input type="date" value={matter.nextDeadline} onChange={(event) => setMatter({ ...matter, nextDeadline: event.target.value })} /></div><div className="form-group"><label>Order IDs</label><input value={matter.orderIds.join(', ')} onChange={(event) => setMatter({ ...matter, orderIds: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></div><div className="form-group"><label>Evidence IDs</label><input value={matter.evidenceIds.join(', ')} onChange={(event) => setMatter({ ...matter, evidenceIds: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></div><div className="form-group"><label>Event IDs</label><input value={matter.eventIds.join(', ')} onChange={(event) => setMatter({ ...matter, eventIds: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></div><div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Notes</label><textarea value={matter.notes} onChange={(event) => setMatter({ ...matter, notes: event.target.value })} /></div></div>}
    </Modal>
    <Modal isOpen={Boolean(alert)} onClose={() => setAlert(null)} title="Add Case Alert" footer={<><button className="btn btn-ghost" type="button" onClick={() => setAlert(null)}>Cancel</button><button className="btn btn-primary" type="button" onClick={() => void saveAlert()}>Save Alert</button></>}>
      {alert && <div className="form-grid"><div className="form-group"><label>Alert type</label><select value={alert.alertType} onChange={(event) => setAlert({ ...alert, alertType: event.target.value as CaseAlert['alertType'] })}>{ALERT_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="form-group"><label>Severity</label><select value={alert.severity} onChange={(event) => setAlert({ ...alert, severity: event.target.value as CaseAlert['severity'] })}><option value="info">Info</option><option value="high">High</option><option value="critical">Critical</option></select></div><div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Title</label><input value={alert.title} onChange={(event) => setAlert({ ...alert, title: event.target.value })} /></div><div className="form-group"><label>Due date</label><input type="date" value={alert.dueDate} onChange={(event) => setAlert({ ...alert, dueDate: event.target.value })} /></div><div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Details</label><textarea value={alert.details} onChange={(event) => setAlert({ ...alert, details: event.target.value })} /></div></div>}
    </Modal>
  </div>;
}
