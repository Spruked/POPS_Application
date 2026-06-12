import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ClipboardList, Eye, FileCheck2, FileText, Shield, Plus, Trash2, Hash, Tag, Search } from 'lucide-react';
import { useEvidenceStore } from '../hooks/useStore';
import { useToast } from '../hooks/useToast';
import { generateId, sha256File, formatDate, formatDateTime, classNames } from '../utils/helpers';
import Modal from '../components/Modal';
import ReviewCommitPanel, { type ReviewCommitDraft } from '../components/evidence/ReviewCommitPanel';
import type { Evidence } from '../types';

const EVIDENCE_TYPES = [
  { value: 'photo', label: 'Photo' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Document' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'other', label: 'Other' },
];

interface SealVerifiedRecordResult {
  id: string;
  recordHash: string;
  createdAt: string;
  auditAction: string;
}

interface SealedRecord {
  id: string;
  originalInput: string;
  systemSuggestion: string;
  finalVerifiedStatement: string;
  categorySuggestion: string;
  recordHash: string;
  createdAt: string;
  verifiedBy: string;
}

interface AuditLedgerItem {
  id: string;
  recordId: string;
  action: string;
  payloadHash: string;
  hash: string;
  createdAt: string;
  metadataJson: string;
  previousLedgerHash?: string;
  ledgerEntryHash?: string;
}

interface EvidenceChainItem {
  id: string;
  evidenceId: string;
  action: string;
  hash: string;
  createdAt: string;
  metadataJson: string;
}

interface ImportedEvidenceFile {
  filePath: string;
  sha256: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  originalModifiedAt?: string;
  importedAt: string;
}

interface IntegrityCheckResult {
  status: string;
  expectedHash: string;
  actualHash?: string;
}

interface CommunicationImportResult {
  id: string;
  evidenceId: string;
  timelineEventId: string;
  originalHash: string;
  messageCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  participants: string[];
  gaps: string[];
  screenshotRisk: string;
  trustGlyphRisk: string;
  courtSafeSummary: string;
}

interface EvidenceVaultProps {
  pendingDraft?: ReviewCommitDraft | null;
}

export default function EvidenceVault({ pendingDraft }: EvidenceVaultProps) {
  const { items, add, remove, refresh } = useEvidenceStore();
  const { show } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sealedRecords, setSealedRecords] = useState<SealedRecord[]>([]);
  const [auditLedger, setAuditLedger] = useState<AuditLedgerItem[]>([]);
  const [sealedRecordsError, setSealedRecordsError] = useState('');
  const [auditLedgerError, setAuditLedgerError] = useState('');
  const [activeDraft, setActiveDraft] = useState<ReviewCommitDraft | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<SealedRecord | null>(null);
  const [selectedAuditRow, setSelectedAuditRow] = useState<AuditLedgerItem | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [evidenceChain, setEvidenceChain] = useState<EvidenceChainItem[]>([]);
  const [integrityResult, setIntegrityResult] = useState<IntegrityCheckResult | null>(null);
  const [sealResult, setSealResult] = useState<SealVerifiedRecordResult | null>(null);
  const [captureForm, setCaptureForm] = useState({
    originalInput: '',
    systemSuggestion: '',
    categorySuggestion: '',
  });
  const [form, setForm] = useState({
    type: 'photo' as Evidence['type'],
    title: '',
    description: '',
    date: '',
    tags: '',
    trustGlyphRisk: 'low' as NonNullable<Evidence['trustGlyphRisk']>,
    sourceDescription: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [computingHash, setComputingHash] = useState(false);
  const [communicationFile, setCommunicationFile] = useState<File | null>(null);
  const [communicationImporting, setCommunicationImporting] = useState(false);
  const [communicationResult, setCommunicationResult] = useState<CommunicationImportResult | null>(null);
  const [communicationForm, setCommunicationForm] = useState({
    title: '',
    incidentId: '',
  });

  useEffect(() => {
    loadSealedRecords();
    loadAuditLedger();
  }, []);

  useEffect(() => {
    if (!pendingDraft) return;
    setCaptureForm({
      originalInput: pendingDraft.originalInput,
      systemSuggestion: pendingDraft.systemSuggestion,
      categorySuggestion: pendingDraft.categorySuggestion,
    });
    setActiveDraft(pendingDraft);
    setSealResult(null);
  }, [pendingDraft]);

  const filtered = items.filter(i => 
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.description.toLowerCase().includes(search.toLowerCase()) ||
    i.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  async function loadSealedRecords() {
    try {
      const records = await invoke<SealedRecord[]>('get_sealed_records');
      setSealedRecords(records);
      setSealedRecordsError('');
    } catch (err) {
      setSealedRecordsError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadAuditLedger() {
    try {
      const rows = await invoke<AuditLedgerItem[]>('get_audit_ledger');
      setAuditLedger(rows);
      setAuditLedgerError('');
    } catch (err) {
      setAuditLedgerError(err instanceof Error ? err.message : String(err));
    }
  }

  async function openEvidenceDetail(item: Evidence) {
    setSelectedEvidence(item);
    setIntegrityResult(null);
    try {
      const rows = await invoke<EvidenceChainItem[]>('get_evidence_chain', { evidenceId: item.id });
      setEvidenceChain(rows);
    } catch {
      setEvidenceChain([]);
    }
  }

  async function verifySelectedEvidence() {
    if (!selectedEvidence) return;
    const result = await invoke<IntegrityCheckResult>('verify_evidence_integrity', {
      evidenceId: selectedEvidence.id,
      filePath: selectedEvidence.filePath,
      expectedHash: selectedEvidence.sha256,
    });
    setIntegrityResult(result);
    const rows = await invoke<EvidenceChainItem[]>('get_evidence_chain', { evidenceId: selectedEvidence.id });
    setEvidenceChain(rows);
    show(`Integrity check: ${result.status}`);
  }

  function trustGlyphClass(risk?: Evidence['trustGlyphRisk']) {
    if (risk === 'high') return 'badge-red';
    if (risk === 'medium') return 'badge-amber';
    return 'badge-green';
  }

  function handleCaptureSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captureForm.originalInput.trim() || !captureForm.systemSuggestion.trim()) return;

    setActiveDraft({
      originalInput: captureForm.originalInput,
      systemSuggestion: captureForm.systemSuggestion,
      categorySuggestion: captureForm.categorySuggestion || 'uncategorized',
    });
    setSealResult(null);
  }

  async function handleSealed(result: SealVerifiedRecordResult) {
    setSealResult(result);
    show('Verified record sealed');
    setCaptureForm({ originalInput: '', systemSuggestion: '', categorySuggestion: '' });
    await loadSealedRecords();
    await loadAuditLedger();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;

    setComputingHash(true);
    let sha256 = 'manual-entry';
    let importedFile: ImportedEvidenceFile | null = null;
    if (file) {
      const evidenceId = generateId();
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      importedFile = await invoke<ImportedEvidenceFile>('import_evidence_file', {
        evidenceId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        originalModifiedAt: new Date(file.lastModified).toISOString(),
        bytes,
      });
      sha256 = importedFile.sha256;
      const evidence: Evidence = {
        id: evidenceId,
        type: form.type,
        title: form.title,
        description: form.description,
        date: form.date || new Date().toISOString().split('T')[0],
        filePath: importedFile.filePath,
        sha256,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        fileName: importedFile.fileName,
        fileSize: importedFile.fileSize,
        fileType: importedFile.fileType,
        trustGlyphRisk: form.trustGlyphRisk,
        sourceDescription: form.sourceDescription,
        originalModifiedAt: importedFile.originalModifiedAt,
        importedAt: importedFile.importedAt,
        createdAt: new Date().toISOString(),
      };

      await add(evidence);
      show('Evidence imported and preserved');
      setIsModalOpen(false);
      setForm({ type: 'photo', title: '', description: '', date: '', tags: '', trustGlyphRisk: 'low', sourceDescription: '' });
      setFile(null);
      setComputingHash(false);
      return;
    }
    setComputingHash(false);

    const evidence: Evidence = {
      id: generateId(),
      type: form.type,
      title: form.title,
      description: form.description,
      date: form.date || new Date().toISOString().split('T')[0],
      sha256,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      trustGlyphRisk: form.trustGlyphRisk,
      sourceDescription: form.sourceDescription,
      importedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await add(evidence);
    show('Evidence saved successfully');
    setIsModalOpen(false);
    setForm({ type: 'photo', title: '', description: '', date: '', tags: '', trustGlyphRisk: 'low', sourceDescription: '' });
    setFile(null);
  }

  async function handleCommunicationImport(e: React.FormEvent) {
    e.preventDefault();
    if (!communicationFile || !communicationForm.title.trim()) return;

    setCommunicationImporting(true);
    try {
      const bytes = Array.from(new Uint8Array(await communicationFile.arrayBuffer()));
      const result = await invoke<CommunicationImportResult>('import_communication_export', {
        title: communicationForm.title,
        fileName: communicationFile.name,
        fileType: communicationFile.type || 'application/octet-stream',
        incidentId: communicationForm.incidentId.trim() || null,
        bytes,
      });
      setCommunicationResult(result);
      setCommunicationForm({ title: '', incidentId: '' });
      setCommunicationFile(null);
      await refresh();
      show('Communication export imported');
    } catch (err) {
      show(err instanceof Error ? err.message : String(err));
    } finally {
      setCommunicationImporting(false);
    }
  }

  function formatMetadataJson(metadataJson: string) {
    try {
      return JSON.stringify(JSON.parse(metadataJson), null, 2);
    } catch {
      return metadataJson;
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Evidence Vault</h2>
        <p>Securely store and hash all case evidence with SHA-256 verification</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Quick Capture / Incident Entry</h3>
          <span className="badge badge-blue">
            <FileCheck2 size={14} /> Review Commit
          </span>
        </div>

        <form onSubmit={handleCaptureSubmit} className="form-grid">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Original Entry</label>
            <textarea
              value={captureForm.originalInput}
              onChange={e => setCaptureForm({ ...captureForm, originalInput: e.target.value })}
              placeholder="Capture the raw incident, note, quote, or observation..."
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Suggested Court-Safe Wording</label>
            <textarea
              value={captureForm.systemSuggestion}
              onChange={e => setCaptureForm({ ...captureForm, systemSuggestion: e.target.value })}
              placeholder="Enter the reviewed neutral statement before final verification..."
            />
          </div>
          <div className="form-group">
            <label>Category Suggestion</label>
            <input
              value={captureForm.categorySuggestion}
              onChange={e => setCaptureForm({ ...captureForm, categorySuggestion: e.target.value })}
              placeholder="e.g., visitation, communication, support"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" type="submit">
              Review Entry
            </button>
          </div>
        </form>
      </div>

      {activeDraft && (
        <ReviewCommitPanel draft={activeDraft} onSealed={handleSealed} />
      )}

      <div className="card">
        <div className="card-header">
          <h3>Communication Evidence Import</h3>
          <span className="badge badge-blue">
            <FileText size={14} /> Message Export
          </span>
        </div>

        <form onSubmit={handleCommunicationImport} className="form-grid">
          <div className="form-group">
            <label>Import Title</label>
            <input
              value={communicationForm.title}
              onChange={e => setCommunicationForm({ ...communicationForm, title: e.target.value })}
              placeholder="e.g., Exchange about missed pickup"
            />
          </div>
          <div className="form-group">
            <label>Incident Link</label>
            <input
              value={communicationForm.incidentId}
              onChange={e => setCommunicationForm({ ...communicationForm, incidentId: e.target.value })}
              placeholder="Optional incident id"
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Message Export File</label>
            <input
              type="file"
              accept=".pdf,.txt,.html,.htm,.csv,.png,.jpg,.jpeg,.webp,.gif,text/plain,text/html,text/csv,application/pdf,image/*"
              onChange={e => setCommunicationFile(e.target.files?.[0] || null)}
            />
            {communicationFile && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Selected: {communicationFile.name} ({(communicationFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" type="submit" disabled={communicationImporting || !communicationFile}>
              {communicationImporting ? 'Importing...' : 'Import Communication'}
            </button>
          </div>
        </form>

        {communicationResult && (
          <div style={{ marginTop: 20 }}>
            <div className="form-grid">
              <div className="form-group">
                <label>Evidence ID</label>
                <input value={communicationResult.evidenceId} readOnly />
              </div>
              <div className="form-group">
                <label>Timeline Event ID</label>
                <input value={communicationResult.timelineEventId} readOnly />
              </div>
              <div className="form-group">
                <label>Messages</label>
                <input value={String(communicationResult.messageCount)} readOnly />
              </div>
              <div className="form-group">
                <label>TrustGlyph</label>
                <input value={communicationResult.trustGlyphRisk} readOnly />
              </div>
              <div className="form-group">
                <label>Screenshot Risk</label>
                <input value={communicationResult.screenshotRisk} readOnly />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Original Export Hash</label>
                <div className="hash-display">{communicationResult.originalHash}</div>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Court-Safe Communication Summary</label>
                <textarea value={communicationResult.courtSafeSummary} readOnly />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Detected Participants</label>
                <div className="hash-display">
                  {communicationResult.participants.length ? communicationResult.participants.join(', ') : 'No participants detected'}
                </div>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Context Gaps / Risk Flags</label>
                <div className="hash-display">
                  {communicationResult.gaps.length ? communicationResult.gaps.join(' | ') : 'No obvious context gaps detected'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {sealResult && (
        <div className="card">
          <div className="card-header">
            <h3>Seal Result</h3>
            <span className="badge badge-green">{sealResult.auditAction}</span>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Record ID</label>
              <input value={sealResult.id} readOnly />
            </div>
            <div className="form-group">
              <label>Created Time</label>
              <input value={sealResult.createdAt} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>SHA-256 Hash</label>
              <div className="hash-display">{sealResult.recordHash}</div>
            </div>
          </div>
        </div>
      )}

      <div className="search-bar">
        <Search size={18} color="var(--text-muted)" />
        <input
          placeholder="Search evidence by title, description, or tags..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} /> Add Evidence
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Sealed Records</h3>
          <span className="badge badge-green">{sealedRecords.length} sealed</span>
        </div>

        {sealedRecordsError ? (
          <div className="empty-state">
            <p>{sealedRecordsError}</p>
          </div>
        ) : sealedRecords.length === 0 ? (
          <div className="empty-state">
            <Shield size={48} />
            <p>No sealed records yet. Review and commit an entry to create the first sealed record.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Category</th>
                  <th>Final Verified Statement</th>
                  <th>Record Hash</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {sealedRecords.map(record => (
                  <tr key={record.id}>
                    <td>{formatDate(record.createdAt)}</td>
                    <td><span className="badge badge-blue">{record.categorySuggestion}</span></td>
                    <td>{record.finalVerifiedStatement}</td>
                    <td>
                      <div className="hash-display">
                        <Hash size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {record.recordHash.slice(0, 32)}...
                      </div>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelectedRecord(record)}>
                        <Eye size={14} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Audit Ledger</h3>
          <span className="badge badge-amber">
            <ClipboardList size={14} /> {auditLedger.length} rows
          </span>
        </div>

        {auditLedgerError ? (
          <div className="empty-state">
            <p>{auditLedgerError}</p>
          </div>
        ) : auditLedger.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={48} />
            <p>No audit ledger rows yet.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Action</th>
                  <th>Record ID</th>
                  <th>Hash</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {auditLedger.map(row => (
                  <tr key={row.id}>
                    <td>{formatDate(row.createdAt)}</td>
                    <td><span className="badge badge-green">{row.action}</span></td>
                    <td><div className="hash-display">{row.recordId}</div></td>
                    <td>
                      <div className="hash-display">
                        <Hash size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {row.hash.slice(0, 32)}...
                      </div>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelectedAuditRow(row)}>
                        <Eye size={14} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Shield size={48} />
            <p>{search ? 'No evidence matches your search.' : 'No evidence items yet. Add your first piece of evidence.'}</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Date</th>
                  <th>SHA-256</th>
                  <th>Tags</th>
                  <th>TrustGlyph</th>
                  <th style={{ width: 150 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td>
                      <span className={classNames('badge', 
                        item.type === 'photo' && 'badge-green',
                        item.type === 'video' && 'badge-blue',
                        item.type === 'audio' && 'badge-amber',
                        item.type === 'document' && 'badge-green',
                        item.type === 'screenshot' && 'badge-blue',
                        item.type === 'other' && 'badge-amber',
                      )}>
                        {item.type}
                      </span>
                    </td>
                    <td><strong>{item.title}</strong></td>
                    <td>{formatDate(item.date)}</td>
                    <td>
                      <div className="hash-display">
                        <Hash size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {item.sha256.slice(0, 24)}...
                      </div>
                    </td>
                    <td>
                      {item.tags.map(t => (
                        <span key={t} style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 8 }}>
                          <Tag size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />{t}
                        </span>
                      ))}
                    </td>
                    <td>
                      <span className={classNames('badge', trustGlyphClass(item.trustGlyphRisk))}>
                        {item.trustGlyphRisk || 'low'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEvidenceDetail(item)}>
                        <Eye size={14} /> View
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { remove(item.id); show('Evidence removed'); }}>
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
        title="Add Evidence"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={computingHash}>
              {computingHash ? 'Computing Hash...' : 'Save Evidence'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label>Evidence Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as Evidence['type'] })}>
              {EVIDENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Title</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g., Visitation Denial Photo" />
          </div>
          <div className="form-group">
            <label>Date of Evidence</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Tags (comma separated)</label>
            <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="e.g., visitation, denial, text-message" />
          </div>
          <div className="form-group">
            <label>TrustGlyph Risk</label>
            <select
              value={form.trustGlyphRisk}
              onChange={e => setForm({ ...form, trustGlyphRisk: e.target.value as NonNullable<Evidence['trustGlyphRisk']> })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe what this evidence proves..." />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Source Description</label>
            <textarea
              value={form.sourceDescription}
              onChange={e => setForm({ ...form, sourceDescription: e.target.value })}
              placeholder="Where this came from, how it was received, device/account/source, and handling notes..."
            />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Attach File (optional — SHA-256 will be computed)</label>
            <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
            {file && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
        title="Sealed Record Detail"
        footer={<button className="btn btn-primary" onClick={() => setSelectedRecord(null)}>Close</button>}
      >
        {selectedRecord && (
          <div className="form-grid">
            <div className="form-group">
              <label>Record ID</label>
              <input value={selectedRecord.id} readOnly />
            </div>
            <div className="form-group">
              <label>Created Time</label>
              <input value={selectedRecord.createdAt} readOnly />
            </div>
            <div className="form-group">
              <label>Category</label>
              <input value={selectedRecord.categorySuggestion} readOnly />
            </div>
            <div className="form-group">
              <label>Verified By</label>
              <input value={selectedRecord.verifiedBy} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Original Entry</label>
              <textarea value={selectedRecord.originalInput} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>System Suggestion</label>
              <textarea value={selectedRecord.systemSuggestion} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Final Verified Statement</label>
              <textarea value={selectedRecord.finalVerifiedStatement} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>SHA-256 Hash</label>
              <div className="hash-display">{selectedRecord.recordHash}</div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(selectedEvidence)}
        onClose={() => setSelectedEvidence(null)}
        title="Evidence Detail"
        footer={
          <>
            <button className="btn btn-ghost" onClick={verifySelectedEvidence}>Verify Integrity</button>
            <button className="btn btn-primary" onClick={() => setSelectedEvidence(null)}>Close</button>
          </>
        }
      >
        {selectedEvidence && (
          <div className="form-grid">
            <div className="form-group">
              <label>Evidence ID</label>
              <input value={selectedEvidence.id} readOnly />
            </div>
            <div className="form-group">
              <label>Type</label>
              <input value={selectedEvidence.type} readOnly />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input value={selectedEvidence.date} readOnly />
            </div>
            <div className="form-group">
              <label>TrustGlyph Risk</label>
              <input value={selectedEvidence.trustGlyphRisk || 'low'} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Title</label>
              <input value={selectedEvidence.title} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <textarea value={selectedEvidence.description} readOnly />
            </div>
            <div className="form-group">
              <label>File Name</label>
              <input value={selectedEvidence.fileName || 'manual-entry'} readOnly />
            </div>
            <div className="form-group">
              <label>File Size</label>
              <input value={selectedEvidence.fileSize ? `${(selectedEvidence.fileSize / 1024).toFixed(1)} KB` : 'manual-entry'} readOnly />
            </div>
            <div className="form-group">
              <label>File Type</label>
              <input value={selectedEvidence.fileType || 'manual-entry'} readOnly />
            </div>
            <div className="form-group">
              <label>Original Modified</label>
              <input value={selectedEvidence.originalModifiedAt || 'manual-entry'} readOnly />
            </div>
            <div className="form-group">
              <label>Imported At</label>
              <input value={selectedEvidence.importedAt || selectedEvidence.createdAt} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Preserved File Path</label>
              <input value={selectedEvidence.filePath || 'manual-entry'} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Source Description</label>
              <textarea value={selectedEvidence.sourceDescription || ''} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>SHA-256 Hash</label>
              <div className="hash-display">{selectedEvidence.sha256}</div>
            </div>
            {integrityResult && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Integrity Check</label>
                <div className="hash-display">
                  {integrityResult.status}
                  {integrityResult.actualHash ? ` | actual: ${integrityResult.actualHash}` : ''}
                </div>
              </div>
            )}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Chain of Custody</label>
              {evidenceChain.length === 0 ? (
                <div className="hash-display">No chain entries found.</div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>Action</th>
                        <th>Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evidenceChain.map(row => (
                        <tr key={row.id}>
                          <td>{formatDateTime(row.createdAt)}</td>
                          <td><span className="badge badge-green">{row.action}</span></td>
                          <td><div className="hash-display">{row.hash.slice(0, 32)}...</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(selectedAuditRow)}
        onClose={() => setSelectedAuditRow(null)}
        title="Audit Metadata"
        footer={<button className="btn btn-primary" onClick={() => setSelectedAuditRow(null)}>Close</button>}
      >
        {selectedAuditRow && (
          <div className="form-grid">
            <div className="form-group">
              <label>Audit ID</label>
              <input value={selectedAuditRow.id} readOnly />
            </div>
            <div className="form-group">
              <label>Created Time</label>
              <input value={selectedAuditRow.createdAt} readOnly />
            </div>
            <div className="form-group">
              <label>Action</label>
              <input value={selectedAuditRow.action} readOnly />
            </div>
            <div className="form-group">
              <label>Record ID</label>
              <input value={selectedAuditRow.recordId} readOnly />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Payload Hash</label>
              <div className="hash-display">{selectedAuditRow.payloadHash}</div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Legacy Hash Column</label>
              <div className="hash-display">{selectedAuditRow.hash}</div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Previous Ledger Hash</label>
              <div className="hash-display">{selectedAuditRow.previousLedgerHash || 'genesis'}</div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Ledger Entry Hash</label>
              <div className="hash-display">{selectedAuditRow.ledgerEntryHash || 'unavailable'}</div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>metadata_json</label>
              <textarea value={formatMetadataJson(selectedAuditRow.metadataJson)} readOnly />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
