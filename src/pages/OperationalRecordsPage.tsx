import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Download, Link2, Plus, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../hooks/useToast';
import { downloadTextFile, formatDateTime, generateId } from '../utils/helpers';
import type { OperationalRecord } from '../types';

type ModuleConfig = {
  title: string;
  section: string;
  recordType: string;
  description: string;
  statusOptions?: string[];
  verificationOptions?: string[];
  fields: Array<{ key: string; label: string; type?: 'text' | 'date' | 'textarea' }>;
};

type FormState = {
  title: string;
  status: string;
  verificationState: string;
  sourceProvenance: string;
  date: string;
  linkedRecordIds: string;
  payload: Record<string, string>;
};

const DEFAULT_STATUS = ['Open', 'In progress', 'Filed', 'Served', 'Completed', 'Archived', 'Disputed'];
const DEFAULT_VERIFICATION = ['Needs Document', 'Approximate', 'Review Needed', 'Verified', 'Disputed', 'Vault Protected'];

function emptyForm(config: ModuleConfig): FormState {
  return {
    title: '',
    status: config.statusOptions?.[0] || DEFAULT_STATUS[0],
    verificationState: config.verificationOptions?.[0] || DEFAULT_VERIFICATION[0],
    sourceProvenance: 'User entered',
    date: '',
    linkedRecordIds: '',
    payload: config.fields.reduce<Record<string, string>>((all, field) => {
      all[field.key] = '';
      return all;
    }, {}),
  };
}

export const MODULE_CONFIGS: Record<string, ModuleConfig> = {
  legalFilings: {
    title: 'Filings',
    section: 'Legal',
    recordType: 'legal_filing',
    description: 'Track filed documents, dates, status, evidence links, and Vault history.',
    fields: [
      { key: 'court', label: 'Court' },
      { key: 'docketNumber', label: 'Docket number' },
      { key: 'filingType', label: 'Filing type' },
      { key: 'filedDate', label: 'Filed date', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  legalMotions: {
    title: 'Motions',
    section: 'Legal',
    recordType: 'legal_motion',
    description: 'Track motions, requested relief, deadlines, orders, evidence links, and status.',
    fields: [
      { key: 'motionType', label: 'Motion type' },
      { key: 'requestedRelief', label: 'Requested relief' },
      { key: 'hearingDate', label: 'Hearing date', type: 'date' },
      { key: 'relatedOrderId', label: 'Related court order ID' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  legalServiceRecords: {
    title: 'Service Records',
    section: 'Legal',
    recordType: 'service_record',
    description: 'Track who was served, service method, proof, dates, and linked documents.',
    fields: [
      { key: 'servedParty', label: 'Served party' },
      { key: 'serviceMethod', label: 'Service method' },
      { key: 'serviceDate', label: 'Service date', type: 'date' },
      { key: 'proofReference', label: 'Proof / receipt reference' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  legalCourtNotes: {
    title: 'Court Notes',
    section: 'Legal',
    recordType: 'court_note',
    description: 'Preserve court-safe notes, appearances, outcomes, and follow-up needs.',
    fields: [
      { key: 'courtDate', label: 'Court date', type: 'date' },
      { key: 'judgeOrOfficer', label: 'Judge / officer' },
      { key: 'appearanceType', label: 'Appearance type' },
      { key: 'outcome', label: 'Outcome', type: 'textarea' },
      { key: 'followUp', label: 'Follow-up', type: 'textarea' },
    ],
  },
  legalAttorneyPackets: {
    title: 'Attorney Packets',
    section: 'Legal',
    recordType: 'attorney_packet_manifest',
    description: 'Track packet manifests, included records, review status, and export readiness.',
    fields: [
      { key: 'recipient', label: 'Recipient' },
      { key: 'packetPurpose', label: 'Packet purpose' },
      { key: 'includedRecords', label: 'Included record IDs', type: 'textarea' },
      { key: 'reviewNotes', label: 'Review notes', type: 'textarea' },
    ],
  },
  calendarCourtDates: {
    title: 'Court Dates & Filing Deadlines',
    section: 'Case Calendar',
    recordType: 'court_deadline',
    description: 'Track court dates, filing deadlines, hearing locations, reminders, and links.',
    fields: [
      { key: 'dateType', label: 'Date type' },
      { key: 'location', label: 'Location' },
      { key: 'deadline', label: 'Deadline date', type: 'date' },
      { key: 'relatedOrderId', label: 'Related court order ID' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  calendarAppointments: {
    title: 'Appointments',
    section: 'Case Calendar',
    recordType: 'calendar_appointment',
    description: 'Track appointments, locations, participants, notices, and linked evidence.',
    fields: [
      { key: 'appointmentType', label: 'Appointment type' },
      { key: 'appointmentDate', label: 'Appointment date', type: 'date' },
      { key: 'location', label: 'Location' },
      { key: 'participants', label: 'Participants' },
      { key: 'noticeStatus', label: 'Notice status' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  calendarMedical: {
    title: 'Medical Records',
    section: 'Case Calendar',
    recordType: 'medical_record',
    description: 'Track providers, appointments, notices, records requests, and medical follow-up.',
    fields: [
      { key: 'provider', label: 'Provider / practice' },
      { key: 'appointmentDate', label: 'Appointment date', type: 'date' },
      { key: 'contactPerson', label: 'Contact person' },
      { key: 'notificationStatus', label: 'Notification status' },
      { key: 'recordsStatus', label: 'Records requested / received' },
      { key: 'linkedEvidenceId', label: 'Linked evidence ID' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  calendarSchool: {
    title: 'School Records',
    section: 'Case Calendar',
    recordType: 'school_record',
    description: 'Track school contacts, notices, meetings, records, and follow-up commitments.',
    fields: [
      { key: 'school', label: 'School / district' },
      { key: 'contactPerson', label: 'Teacher / counselor / administrator' },
      { key: 'meetingDate', label: 'Meeting or notice date', type: 'date' },
      { key: 'notificationStatus', label: 'Notification status' },
      { key: 'recordsStatus', label: 'Records requested / received' },
      { key: 'linkedEvidenceId', label: 'Linked evidence ID' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  calendarAttorneyMeetings: {
    title: 'Attorney & Case Meetings',
    section: 'Case Calendar',
    recordType: 'attorney_meeting',
    description: 'Track attorney meetings, case conferences, advice received, and follow-up actions.',
    fields: [
      { key: 'attorneyOrOffice', label: 'Attorney / office' },
      { key: 'meetingDate', label: 'Meeting date', type: 'date' },
      { key: 'meetingType', label: 'Meeting type' },
      { key: 'topics', label: 'Topics discussed', type: 'textarea' },
      { key: 'followUp', label: 'Follow-up actions', type: 'textarea' },
    ],
  },
  calendarSupportDeadlines: {
    title: 'Support Deadlines',
    section: 'Case Calendar',
    recordType: 'support_deadline',
    description: 'Track support payment, agency, filing, and documentation deadlines.',
    fields: [
      { key: 'deadlineType', label: 'Deadline type' },
      { key: 'deadlineDate', label: 'Deadline date', type: 'date' },
      { key: 'agencyOrRecipient', label: 'Agency / recipient' },
      { key: 'relatedPaymentId', label: 'Related payment ID' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  calendarRequiredContacts: {
    title: 'Contact Commitments',
    section: 'Case Calendar',
    recordType: 'required_contact',
    description: 'Track required calls, notices, responses, and contact follow-up.',
    fields: [
      { key: 'contactName', label: 'Contact' },
      { key: 'contactRole', label: 'Role / organization' },
      { key: 'dueDate', label: 'Due date', type: 'date' },
      { key: 'contactMethod', label: 'Contact method' },
      { key: 'result', label: 'Result', type: 'textarea' },
    ],
  },
  calendarReminders: {
    title: 'Reminders',
    section: 'Case Calendar',
    recordType: 'case_reminder',
    description: 'Track reminders tied to court, evidence, contacts, records, and deadlines.',
    fields: [
      { key: 'reminderDate', label: 'Reminder date', type: 'date' },
      { key: 'reminderType', label: 'Reminder type' },
      { key: 'relatedRecordId', label: 'Related record ID' },
      { key: 'actionNeeded', label: 'Action needed', type: 'textarea' },
    ],
  },
  calendarFollowUps: {
    title: 'Follow-Ups',
    section: 'Case Calendar',
    recordType: 'case_follow_up',
    description: 'Track unresolved actions and the next responsible follow-up step.',
    fields: [
      { key: 'followUpDate', label: 'Follow-up date', type: 'date' },
      { key: 'owner', label: 'Responsible person / office' },
      { key: 'relatedRecordId', label: 'Related record ID' },
      { key: 'nextStep', label: 'Next step', type: 'textarea' },
    ],
  },
  eventsDeniedVisits: {
    title: 'Denied Visits',
    section: 'Events',
    recordType: 'denied_visit_trace',
    description: 'Track denied visits and link them to incident, evidence, court order, and communication records.',
    fields: [
      { key: 'scheduledStart', label: 'Scheduled start' },
      { key: 'scheduledEnd', label: 'Scheduled end' },
      { key: 'exchangeLocation', label: 'Exchange location' },
      { key: 'whoDenied', label: 'Who denied' },
      { key: 'linkedIncidentId', label: 'Linked incident ID' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  eventsCommunication: {
    title: 'Communication',
    section: 'Events',
    recordType: 'communication_trace',
    description: 'Track communication records and link them to evidence imports, incidents, and timeline entries.',
    fields: [
      { key: 'platform', label: 'Platform / source' },
      { key: 'participants', label: 'Participants' },
      { key: 'communicationDate', label: 'Communication date', type: 'date' },
      { key: 'linkedEvidenceId', label: 'Linked evidence ID' },
      { key: 'summary', label: 'Court-safe summary', type: 'textarea' },
    ],
  },
  eventsGoodFaith: {
    title: 'Good-Faith Attempts',
    section: 'Events',
    recordType: 'good_faith_attempt',
    description: 'Track attempts to resolve, communicate, appear, exchange, or obtain records.',
    fields: [
      { key: 'attemptType', label: 'Attempt type' },
      { key: 'recipient', label: 'Recipient' },
      { key: 'attemptDate', label: 'Attempt date', type: 'date' },
      { key: 'result', label: 'Result' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  eventsCaseNotes: {
    title: 'Case Notes',
    section: 'Events',
    recordType: 'case_note',
    description: 'Keep factual, court-safe notes with source status and Vault history.',
    fields: [
      { key: 'noteType', label: 'Note type' },
      { key: 'source', label: 'Source' },
      { key: 'note', label: 'Note', type: 'textarea' },
    ],
  },
  reportsCourtPacket: {
    title: 'Court Packet',
    section: 'Reports',
    recordType: 'court_packet_manifest',
    description: 'Track court packet manifests, included exhibits, print status, and review status.',
    fields: [
      { key: 'packetPurpose', label: 'Packet purpose' },
      { key: 'includedRecordIds', label: 'Included record IDs', type: 'textarea' },
      { key: 'printStatus', label: 'Print status' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  reportsReviewFlags: {
    title: 'Review Flags',
    section: 'Reports',
    recordType: 'review_flag',
    description: 'Track attorney review, forensic review, weak records, and export blockers.',
    statusOptions: ['Open', 'Cleared', 'Deferred', 'Archived'],
    verificationOptions: ['Review Needed', 'Forensic Review', 'Needs Document', 'Verified'],
    fields: [
      { key: 'flagType', label: 'Flag type' },
      { key: 'relatedRecordId', label: 'Related record ID' },
      { key: 'issue', label: 'Issue', type: 'textarea' },
      { key: 'resolution', label: 'Resolution', type: 'textarea' },
    ],
  },
  settingsDataBackup: {
    title: 'Data Backup',
    section: 'Settings',
    recordType: 'backup_manifest',
    description: 'Track backup/export runs and what Vault content was included.',
    fields: [
      { key: 'backupPath', label: 'Backup path' },
      { key: 'includedContent', label: 'Included content', type: 'textarea' },
      { key: 'verification', label: 'Verification result' },
    ],
  },
  settingsSecurity: {
    title: 'Security',
    section: 'Settings',
    recordType: 'security_review',
    description: 'Track local integrity checks and security review notes without claiming unavailable encryption.',
    fields: [
      { key: 'checkType', label: 'Check type' },
      { key: 'result', label: 'Result' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  settingsPreferences: {
    title: 'Preferences',
    section: 'Settings',
    recordType: 'user_preference',
    description: 'Persist real user preference choices as Vault-backed records.',
    fields: [
      { key: 'preferenceKey', label: 'Preference key' },
      { key: 'preferenceValue', label: 'Preference value' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  membersLicense: {
    title: 'License',
    section: 'Members',
    recordType: 'local_license_record',
    description: 'Track local desktop license/access-token checks without website checkout data.',
    statusOptions: ['Ready', 'Needs Review', 'Expired', 'Archived'],
    verificationOptions: ['Local Check Needed', 'Verified', 'Review Needed'],
    fields: [
      { key: 'licenseTokenId', label: 'Local token ID' },
      { key: 'licenseType', label: 'License type' },
      { key: 'validatedAt', label: 'Validated date', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  membersAccount: {
    title: 'Account',
    section: 'Members',
    recordType: 'local_account_record',
    description: 'Track local profile/account state owned by this installed app.',
    fields: [
      { key: 'profileRecordId', label: 'Profile record ID' },
      { key: 'workspaceRole', label: 'Workspace role' },
      { key: 'localStatus', label: 'Local status' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  membersBrotherhood: {
    title: 'Community Bridge',
    section: 'Members',
    recordType: 'community_bridge_record',
    description: 'Track community/resource follow-up records without creating a store or checkout system.',
    fields: [
      { key: 'resourceType', label: 'Resource type' },
      { key: 'contactOrGroup', label: 'Contact / group' },
      { key: 'followUpDate', label: 'Follow-up date', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
};

export default function OperationalRecordsPage({ config }: { config: ModuleConfig }) {
  const { show } = useToast();
  const [records, setRecords] = useState<OperationalRecord[]>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm(config));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<OperationalRecord[]>('get_operational_records', { recordType: config.recordType })
      .then((items) => {
        setRecords(items);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
        show(`${config.title} failed to load from Vault database.`, 'error');
      });
  }, [config.recordType, config.title, show]);

  const statusOptions = config.statusOptions || DEFAULT_STATUS;
  const verificationOptions = config.verificationOptions || DEFAULT_VERIFICATION;

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [records]);

  async function handleSave(event?: FormEvent) {
    event?.preventDefault();
    if (!form.title.trim()) {
      show('Title is required.', 'error');
      return;
    }

    const id = generateId();
    const now = new Date().toISOString();
    const record: OperationalRecord = {
      id,
      glyphTraceId: `glyph:${config.recordType}:${id}`,
      recordType: config.recordType,
      caseId: 'default',
      title: form.title.trim(),
      status: form.status,
      verificationState: form.verificationState,
      sourceProvenance: form.sourceProvenance.trim() || 'User entered',
      date: form.date,
      linkedRecordIds: form.linkedRecordIds.split(',').map((item) => item.trim()).filter(Boolean),
      payload: form.payload,
      vaultPath: '',
      createdAt: now,
      updatedAt: now,
      archived: false,
    };

    try {
      await invoke('save_operational_record', { item: record });
      const refreshed = await invoke<OperationalRecord[]>('get_operational_records', { recordType: config.recordType });
      setRecords(refreshed);
      setForm(emptyForm(config));
      setIsModalOpen(false);
      show(`${config.title} record saved to Vault.`);
    } catch {
      show('Save failed. Record was not written outside the Vault database.', 'error');
    }
  }

  async function deleteRecord(id: string) {
    try {
      await invoke('delete_operational_record', { id });
      setRecords((items) => items.filter((item) => item.id !== id));
      show('Record deleted with Vault tombstone.');
    } catch {
      show('Delete failed.', 'error');
    }
  }

  function exportRecords() {
    downloadTextFile(
      `pops-${config.recordType}-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(sortedRecords, null, 2),
    );
    show('Module records exported.');
  }

  return (
    <div>
      <div className="page-header">
        <span className="mission-kicker">{config.section}</span>
        <h2>{config.title}</h2>
        <p>{config.description}</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{config.title} Records</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={exportRecords}>
              <Download size={14} /> Export
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>
              <Plus size={14} /> Add Record
            </button>
          </div>
        </div>

        {sortedRecords.length === 0 ? (
          <div className="empty-state">
            <p>{loaded ? 'No records yet. Add the first Vault-backed record.' : 'Loading from Vault database...'}</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Status</th>
                  <th>Glyph Trace</th>
                  <th>Links</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>{record.title}</strong>
                      <div>{record.sourceProvenance}</div>
                      <div>{record.date}</div>
                    </td>
                    <td>
                      <span className="badge badge-blue">{record.status}</span>
                      <span className="badge badge-amber" style={{ marginLeft: 6 }}>{record.verificationState}</span>
                    </td>
                    <td>
                      <code>{record.glyphTraceId}</code>
                      <div className="hash-display" style={{ marginTop: 6 }}>{record.vaultPath}</div>
                    </td>
                    <td>
                      {record.linkedRecordIds.length ? record.linkedRecordIds.map((id) => (
                        <span key={id} className="badge badge-green" style={{ marginRight: 4 }}>
                          <Link2 size={11} /> {id}
                        </span>
                      )) : 'None'}
                    </td>
                    <td>{formatDateTime(record.updatedAt)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteRecord(record.id)}>
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
        title={`Add ${config.title} Record`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => void handleSave()}>Save Record</button>
          </>
        }
      >
        <form className="form-grid" onSubmit={(event) => void handleSave(event)}>
          <div className="form-group">
            <label>Title</label>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </div>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {statusOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Verification State</label>
            <select value={form.verificationState} onChange={(event) => setForm({ ...form, verificationState: event.target.value })}>
              {verificationOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Source / Provenance</label>
            <input value={form.sourceProvenance} onChange={(event) => setForm({ ...form, sourceProvenance: event.target.value })} />
          </div>
          <div className="form-group">
            <label>Linked Record IDs</label>
            <input value={form.linkedRecordIds} onChange={(event) => setForm({ ...form, linkedRecordIds: event.target.value })} placeholder="Comma-separated IDs" />
          </div>
          {config.fields.map((field) => (
            <div className="form-group" key={field.key} style={field.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
              <label>{field.label}</label>
              {field.type === 'textarea' ? (
                <textarea value={form.payload[field.key] || ''} onChange={(event) => setForm({ ...form, payload: { ...form.payload, [field.key]: event.target.value } })} />
              ) : (
                <input type={field.type || 'text'} value={form.payload[field.key] || ''} onChange={(event) => setForm({ ...form, payload: { ...form.payload, [field.key]: event.target.value } })} />
              )}
            </div>
          ))}
        </form>
      </Modal>
    </div>
  );
}
