import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { AlertTriangle, Download, FileCheck, FileText, Plus, Receipt, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../hooks/useToast';
import { downloadTextFile, formatDate, generateId, sha256File } from '../utils/helpers';

type SupportRecordStatus =
  | 'user_entered'
  | 'bank_corroborated'
  | 'agency_statement_imported'
  | 'agency_certified'
  | 'disputed'
  | 'corrected';

type SupportCategory = 'current_support' | 'arrears' | 'mixed';

type ChildSupportPayment = {
  id: string;
  monthlyAmountDue: string;
  dueDate: string;
  amountPaid: string;
  paymentDate: string;
  paymentMethod: string;
  stateCaseNumber: string;
  confirmationNumber: string;
  supportCategory: SupportCategory;
  sourceStatus: SupportRecordStatus;
  officialBalance: string;
  arrearsBalance: string;
  receiptFileName: string;
  receiptFileSize: number;
  receiptSha256: string;
  agencyStatementName: string;
  agencyStatementSha256: string;
  correctionNote: string;
  disputeNote: string;
  missedPaymentClaim: string;
  certifiedRecord: boolean;
  createdAt: string;
  updatedAt: string;
};

type LedgerForm = Omit<ChildSupportPayment, 'id' | 'createdAt' | 'updatedAt'>;

const EMPTY_FORM: LedgerForm = {
  monthlyAmountDue: '',
  dueDate: '',
  amountPaid: '',
  paymentDate: '',
  paymentMethod: '',
  stateCaseNumber: '',
  confirmationNumber: '',
  supportCategory: 'current_support',
  sourceStatus: 'user_entered',
  officialBalance: '',
  arrearsBalance: '',
  receiptFileName: '',
  receiptFileSize: 0,
  receiptSha256: '',
  agencyStatementName: '',
  agencyStatementSha256: '',
  correctionNote: '',
  disputeNote: '',
  missedPaymentClaim: '',
  certifiedRecord: false,
};

const STATUS_LABELS: Record<SupportRecordStatus, string> = {
  user_entered: 'User entered',
  bank_corroborated: 'Bank corroborated',
  agency_statement_imported: 'Agency statement imported',
  agency_certified: 'Agency certified',
  disputed: 'Disputed',
  corrected: 'Corrected',
};

const STATUS_CLASS: Record<SupportRecordStatus, string> = {
  user_entered: 'badge-blue',
  bank_corroborated: 'badge-green',
  agency_statement_imported: 'badge-green',
  agency_certified: 'badge-green',
  disputed: 'badge-red',
  corrected: 'badge-amber',
};

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  current_support: 'Current support',
  arrears: 'Arrears',
  mixed: 'Current + arrears',
};

function money(value: string | number) {
  const amount = typeof value === 'number' ? value : Number(value || 0);
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function numeric(value: string) {
  return Number(value || 0);
}

function buildCourtExhibit(records: ChildSupportPayment[]) {
  const lines = [
    'POPS Child Support Payment Ledger',
    `Exported UTC: ${new Date().toISOString()}`,
    '',
    'Record status meanings:',
    '- User entered: manually entered by the user until corroborated.',
    '- Bank corroborated: matched against bank or payment receipt evidence.',
    '- Agency statement imported: imported from an agency statement, report, or downloaded portal history.',
    '- Agency certified: marked as certified official agency record by the user.',
    '- Disputed: user has identified a disagreement or missed-payment claim.',
    '- Corrected: prior record was corrected and retained in the audit trail.',
    '',
  ];

  records.forEach((record, index) => {
    lines.push(
      `Record ${index + 1}: ${record.id}`,
      `Due date: ${record.dueDate || 'not set'}`,
      `Monthly amount due: ${money(record.monthlyAmountDue)}`,
      `Amount paid: ${money(record.amountPaid)}`,
      `Payment date: ${record.paymentDate || 'not set'}`,
      `Payment method: ${record.paymentMethod || 'not set'}`,
      `State case number: ${record.stateCaseNumber || 'not set'}`,
      `Confirmation / receipt number: ${record.confirmationNumber || 'not set'}`,
      `Category: ${CATEGORY_LABELS[record.supportCategory]}`,
      `Status: ${STATUS_LABELS[record.sourceStatus]}`,
      `Official balance: ${record.officialBalance ? money(record.officialBalance) : 'not set'}`,
      `Arrears balance: ${record.arrearsBalance ? money(record.arrearsBalance) : 'not set'}`,
      `Receipt file: ${record.receiptFileName || 'none'}`,
      `Receipt SHA-256: ${record.receiptSha256 || 'none'}`,
      `Agency statement: ${record.agencyStatementName || 'none'}`,
      `Agency statement SHA-256: ${record.agencyStatementSha256 || 'none'}`,
      `Certified record: ${record.certifiedRecord ? 'yes' : 'no'}`,
      `Correction note: ${record.correctionNote || 'none'}`,
      `Dispute note: ${record.disputeNote || 'none'}`,
      `Missed-payment claim: ${record.missedPaymentClaim || 'none'}`,
      `Created: ${record.createdAt}`,
      `Updated: ${record.updatedAt}`,
      ''
    );
  });

  return lines.join('\n');
}

export default function ChildSupportLedger() {
  const { show } = useToast();
  const [records, setRecords] = useState<ChildSupportPayment[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<LedgerForm>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [hashing, setHashing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<ChildSupportPayment[]>('get_child_support_payments')
      .then((items) => {
        setRecords(items);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
        show('Child-support ledger failed to load from Vault database.', 'error');
      });
  }, [show]);

  const sortedRecords = useMemo(() => {
    return records
      .filter((record) => {
        const haystack = [
          record.stateCaseNumber,
          record.confirmationNumber,
          record.paymentMethod,
          record.receiptFileName,
          record.agencyStatementName,
          STATUS_LABELS[record.sourceStatus],
        ].join(' ').toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
      .sort((a, b) => `${b.paymentDate || b.dueDate}`.localeCompare(`${a.paymentDate || a.dueDate}`));
  }, [records, search]);

  const totals = useMemo(() => {
    const totalDue = records.reduce((sum, record) => sum + numeric(record.monthlyAmountDue), 0);
    const totalPaid = records.reduce((sum, record) => sum + numeric(record.amountPaid), 0);
    const disputedCount = records.filter((record) => record.sourceStatus === 'disputed' || record.missedPaymentClaim.trim()).length;
    const agencyCount = records.filter((record) => record.sourceStatus === 'agency_statement_imported' || record.sourceStatus === 'agency_certified').length;
    const latestOfficial = records
      .filter((record) => record.officialBalance.trim())
      .sort((a, b) => `${b.updatedAt}`.localeCompare(a.updatedAt))[0];
    return {
      totalDue,
      totalPaid,
      variance: totalPaid - totalDue,
      disputedCount,
      agencyCount,
      latestOfficialBalance: latestOfficial?.officialBalance || '',
    };
  }, [records]);

  async function handleFileHash(event: ChangeEvent<HTMLInputElement>, kind: 'receipt' | 'agency') {
    const file = event.target.files?.[0];
    if (!file) return;

    setHashing(true);
    try {
      const digest = await sha256File(file);
      if (kind === 'receipt') {
        setForm((prev) => ({
          ...prev,
          receiptFileName: file.name,
          receiptFileSize: file.size,
          receiptSha256: digest,
        }));
      } else {
        setForm((prev) => ({
          ...prev,
          agencyStatementName: file.name,
          agencyStatementSha256: digest,
          sourceStatus: prev.sourceStatus === 'user_entered' ? 'agency_statement_imported' : prev.sourceStatus,
        }));
      }
      show('Imported record hashed with SHA-256.');
    } finally {
      setHashing(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.dueDate || !form.monthlyAmountDue.trim()) {
      show('Monthly amount due and due date are required.', 'error');
      return;
    }

    const now = new Date().toISOString();
    const record: ChildSupportPayment = {
      id: generateId(),
      ...form,
      monthlyAmountDue: form.monthlyAmountDue.trim(),
      amountPaid: form.amountPaid.trim(),
      paymentMethod: form.paymentMethod.trim(),
      stateCaseNumber: form.stateCaseNumber.trim(),
      confirmationNumber: form.confirmationNumber.trim(),
      officialBalance: form.officialBalance.trim(),
      arrearsBalance: form.arrearsBalance.trim(),
      correctionNote: form.correctionNote.trim(),
      disputeNote: form.disputeNote.trim(),
      missedPaymentClaim: form.missedPaymentClaim.trim(),
      certifiedRecord: form.certifiedRecord || form.sourceStatus === 'agency_certified',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await invoke('save_child_support_payment', { item: record });
      setRecords((prev) => [record, ...prev.filter((item) => item.id !== record.id)]);
      show('Child-support ledger record saved to Vault audit trail.');
    } catch {
      show('Ledger save failed. Nothing was written outside the Vault database.', 'error');
      return;
    }
    setForm(EMPTY_FORM);
    setIsModalOpen(false);
  }

  async function removeRecord(id: string) {
    try {
      await invoke('delete_child_support_payment', { id });
      setRecords((prev) => prev.filter((record) => record.id !== id));
    } catch {
      show('Vault delete failed. Record was not removed from the UI.', 'error');
      return;
    }
    show('Ledger record removed with Vault tombstone.');
  }

  function exportExhibit() {
    downloadTextFile(`pops-child-support-ledger-${new Date().toISOString().slice(0, 10)}.txt`, buildCourtExhibit(sortedRecords));
    show('Child-support court exhibit exported.');
  }

  const discrepancyTone = totals.variance < 0 ? 'red' : totals.variance > 0 ? 'green' : 'blue';

  return (
    <div>
      <div className="page-header">
        <h2>Child Support Payment Ledger</h2>
        <p>Track support obligations, payments, arrears, receipts, agency statements, and disputes.</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Monthly Obligations Logged</div>
          <div className="stat-value">{money(totals.totalDue)}</div>
          <div className="stat-delta">Current support and arrears entries</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Payments Logged</div>
          <div className="stat-value">{money(totals.totalPaid)}</div>
          <div className="stat-delta">Manual, bank, and agency-backed entries</div>
        </div>
        <div className={`stat-card ${discrepancyTone}`}>
          <div className="stat-label">Ledger Difference</div>
          <div className="stat-value">{money(totals.variance)}</div>
          <div className="stat-delta">Positive means paid over logged due</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Official Balance</div>
          <div className="stat-value">{totals.latestOfficialBalance ? money(totals.latestOfficialBalance) : '--'}</div>
          <div className="stat-delta">{totals.agencyCount} agency-backed record(s)</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Receipt size={18} /> Payment History
          </h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={exportExhibit}>
              <Download size={14} /> Export Exhibit
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>
              <Plus size={14} /> Add / Import
            </button>
          </div>
        </div>

        <div className="search-bar">
          <FileText size={18} color="var(--text-muted)" />
          <input
            placeholder="Search case number, confirmation, method, file, or source status..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {sortedRecords.length === 0 ? (
          <div className="empty-state">
            <Receipt size={48} />
            <p>{loaded ? 'No child-support ledger records yet. Add a manual entry or import an agency statement.' : 'Loading child-support ledger from Vault database...'}</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Due</th>
                  <th>Paid</th>
                  <th>Method / Confirmation</th>
                  <th>Case</th>
                  <th>Status</th>
                  <th>Hash</th>
                  <th>Flags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((record) => {
                  const shortHash = record.agencyStatementSha256 || record.receiptSha256;
                  const isShort = shortHash ? `${shortHash.slice(0, 12)}...` : 'Not imported';
                  return (
                    <tr key={record.id}>
                      <td>
                        <strong>{money(record.monthlyAmountDue)}</strong>
                        <div>{formatDate(record.dueDate)}</div>
                        <div>{CATEGORY_LABELS[record.supportCategory]}</div>
                      </td>
                      <td>
                        <strong>{money(record.amountPaid)}</strong>
                        <div>{formatDate(record.paymentDate)}</div>
                      </td>
                      <td>
                        <div>{record.paymentMethod || 'Not set'}</div>
                        <div>{record.confirmationNumber || 'No confirmation'}</div>
                      </td>
                      <td>{record.stateCaseNumber || 'Not set'}</td>
                      <td>
                        <span className={`badge ${STATUS_CLASS[record.sourceStatus]}`}>
                          {STATUS_LABELS[record.sourceStatus]}
                        </span>
                      </td>
                      <td>
                        <code>{isShort}</code>
                        <div>{record.agencyStatementName || record.receiptFileName || ''}</div>
                      </td>
                      <td>
                        {record.certifiedRecord && <span className="badge badge-green">Certified</span>}
                        {record.disputeNote && <span className="badge badge-red">Dispute</span>}
                        {record.correctionNote && <span className="badge badge-amber">Correction</span>}
                        {record.missedPaymentClaim && <span className="badge badge-red">Missed claim</span>}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => removeRecord(record.id)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileCheck size={18} /> Official Record Request Checklist
          </h3>
        </div>
        <div className="support-request-grid">
          {[
            'Sign in to the official state child-support portal yourself.',
            'Download payment history, disbursement history, balance, arrears, and certified statement if available.',
            'Do not store portal passwords in POPS.',
            'Import the downloaded PDF, CSV, webpage report, or scanned certified statement here.',
            'Confirm each imported record has a SHA-256 hash and source status.',
            'Mark agency-certified records only when the returned document is certified or officially stamped.',
          ].map((line) => (
            <div className="support-request-item" key={line}>
              <FileCheck size={16} />
              <span>{line}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ borderLeft: '3px solid var(--accent-blue)' }}>
        <h3 style={{ marginBottom: 8 }}>Future Office Reconciliation</h3>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Direct reconciliation with child-support offices is reserved for a later integration phase.
          This ledger preserves the user record, imported agency files, hashes, disputes, corrections,
          and exhibit exports now without storing portal credentials or automating government logins.
        </p>
      </div>

      {totals.disputedCount > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--accent-red)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={18} /> Discrepancy Detector
          </h3>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {totals.disputedCount} record(s) include a dispute, correction, or missed-payment claim. Export the exhibit
            and compare it against agency-certified history before filing or sharing.
          </p>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Child Support Record"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={hashing}>
              Save Ledger Record
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label>Monthly Amount Due</label>
            <input value={form.monthlyAmountDue} onChange={(e) => setForm({ ...form, monthlyAmountDue: e.target.value })} placeholder="500.00" />
          </div>
          <div className="form-group">
            <label>Due Date</label>
            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Amount Paid</label>
            <input value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: e.target.value })} placeholder="500.00" />
          </div>
          <div className="form-group">
            <label>Payment Date</label>
            <input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Payment Method</label>
            <input value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} placeholder="State portal, bank draft, money order..." />
          </div>
          <div className="form-group">
            <label>Confirmation / Receipt Number</label>
            <input value={form.confirmationNumber} onChange={(e) => setForm({ ...form, confirmationNumber: e.target.value })} />
          </div>
          <div className="form-group">
            <label>State Case Number</label>
            <input value={form.stateCaseNumber} onChange={(e) => setForm({ ...form, stateCaseNumber: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Support Type</label>
            <select value={form.supportCategory} onChange={(e) => setForm({ ...form, supportCategory: e.target.value as SupportCategory })}>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Record Source Status</label>
            <select value={form.sourceStatus} onChange={(e) => setForm({ ...form, sourceStatus: e.target.value as SupportRecordStatus })}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Official Balance</label>
            <input value={form.officialBalance} onChange={(e) => setForm({ ...form, officialBalance: e.target.value })} placeholder="Agency balance if known" />
          </div>
          <div className="form-group">
            <label>Arrears Balance</label>
            <input value={form.arrearsBalance} onChange={(e) => setForm({ ...form, arrearsBalance: e.target.value })} placeholder="Past-due support if known" />
          </div>
          <div className="form-group">
            <label>Receipt / Confirmation File</label>
            <input type="file" onChange={(event) => void handleFileHash(event, 'receipt')} />
            {form.receiptSha256 && <code>{form.receiptSha256}</code>}
          </div>
          <div className="form-group">
            <label>Agency Statement / Certified Record</label>
            <input type="file" onChange={(event) => void handleFileHash(event, 'agency')} />
            {form.agencyStatementSha256 && <code>{form.agencyStatementSha256}</code>}
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Correction Notes</label>
            <textarea value={form.correctionNote} onChange={(e) => setForm({ ...form, correctionNote: e.target.value })} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Dispute Notes</label>
            <textarea value={form.disputeNote} onChange={(e) => setForm({ ...form, disputeNote: e.target.value })} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Missed-Payment Claim</label>
            <textarea value={form.missedPaymentClaim} onChange={(e) => setForm({ ...form, missedPaymentClaim: e.target.value })} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}>
              <input
                type="checkbox"
                checked={form.certifiedRecord}
                onChange={(e) => setForm({ ...form, certifiedRecord: e.target.checked, sourceStatus: e.target.checked ? 'agency_certified' : form.sourceStatus })}
              />
              Mark as agency-certified official record
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}
