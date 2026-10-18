import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle, Gavel, Plus, ShieldAlert, XCircle } from 'lucide-react';
import OperationalRecordsPage, { MODULE_CONFIGS } from './OperationalRecordsPage';
import {
  acknowledgeSlot,
  applySaveResult,
  askNotificationPermission,
  deviceTimeZone,
  formatVenueTime,
  notificationPermission,
  reminderApi,
  type PermissionState,
  type ReminderAppointment,
  type ReminderKind,
  type ReminderSettings,
  type ReminderSlot,
} from '../utils/reminderRuntime';
import { usePlatformCapabilities } from '../utils/platform';

const KINDS: { value: ReminderKind; label: string }[] = [
  { value: 'court', label: 'Court appearance' },
  { value: 'attorney', label: 'Attorney meeting' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'deadline', label: 'Filing / support deadline' },
  { value: 'other', label: 'Other' },
];

const COMMON_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'];

function zoneOptions(current: string): string[] {
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    all = [];
  }
  return Array.from(new Set([current, ...COMMON_ZONES, ...all]));
}

const STATE_LABEL: Record<string, { text: string; badge: string }> = {
  pending: { text: 'Waiting to schedule', badge: 'badge-amber' },
  os_scheduled: { text: 'Scheduled on device', badge: 'badge-blue' },
  schedule_failed: { text: 'Not scheduled', badge: 'badge-red' },
  fired: { text: 'Sent, not acknowledged', badge: 'badge-red' },
  acknowledged: { text: 'Seen', badge: 'badge-green' },
  not_needed: { text: 'Not needed (seen)', badge: 'badge-green' },
  skipped_past: { text: 'Time already passed', badge: 'badge' },
};

const fmtOffset = (m: number) => (m % 1440 === 0 ? `${m / 1440}d` : m % 60 === 0 ? `${m / 60}h` : `${m}m`);
const parseOffsets = (text: string): number[] =>
  text
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .map((t) => {
      const n = parseFloat(t);
      if (Number.isNaN(n)) return 0;
      if (t.endsWith('d')) return Math.round(n * 1440);
      if (t.endsWith('h')) return Math.round(n * 60);
      return Math.round(n);
    })
    .filter((n) => n > 0);

const emptyForm = (tz: string) => ({ kind: 'court' as ReminderKind, title: '', date: '', time: '09:00', timeZone: tz, location: '', notes: '', offsets: '' });

export default function Reminders() {
  const caps = usePlatformCapabilities();
  const [appts, setAppts] = useState<ReminderAppointment[]>([]);
  const [slots, setSlots] = useState<ReminderSlot[]>([]);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [permission, setPermission] = useState<PermissionState>('default');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => emptyForm(deviceTimeZone()));
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [courtDefaults, setCourtDefaults] = useState('');

  const load = useCallback(async () => {
    try {
      const [a, s, st] = await Promise.all([reminderApi.appointments(), reminderApi.slots(), reminderApi.settings()]);
      setAppts(a);
      setSlots(s);
      setSettings(st);
      setCourtDefaults(st.courtOffsets.map(fmtOffset).join(', '));
    } catch (err) {
      setMessage({ tone: 'error', text: `Reminder engine unavailable: ${String(err)}` });
    }
    setPermission(await notificationPermission());
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener('pops:reminders-changed', onChange);
    return () => window.removeEventListener('pops:reminders-changed', onChange);
  }, [load]);

  const upcoming = useMemo(() => appts.filter((a) => a.status !== 'cancelled' && Date.parse(a.startUtc) > Date.now() - 6 * 3600e3), [appts]);
  const past = useMemo(() => appts.filter((a) => !upcoming.includes(a)), [appts, upcoming]);
  const slotsFor = (id: string) => slots.filter((s) => s.appointmentId === id && s.slotKind === 'reminder');

  async function save(confirm: boolean) {
    if (!form.title.trim() || !form.date || !form.time) {
      setMessage({ tone: 'error', text: 'Title, date and time are required.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await reminderApi.save({
        kind: form.kind,
        title: form.title.trim(),
        location: form.location.trim(),
        notes: form.notes.trim(),
        localStart: `${form.date}T${form.time}`,
        timeZone: form.timeZone,
        offsets: parseOffsets(form.offsets),
        status: confirm ? 'confirmed' : 'draft',
        source: caps?.mobile ? 'mobile_user_entered' : 'desktop_user_entered',
      });
      let perm = permission;
      if (confirm) perm = await askNotificationPermission();
      setPermission(perm);
      const sync = await applySaveResult(res);
      const pendingCount = res.slots.filter((s) => s.slotKind === 'reminder' && s.state !== 'skipped_past').length;
      const warnings = [...res.warnings];
      if (confirm && caps?.mobile && perm !== 'granted') warnings.push('Notifications are off for POPS, so these reminders cannot alert you. Turn them on in Settings.');
      if (sync.deferred) warnings.push(`${sync.deferred} later reminders will be scheduled automatically as earlier ones pass.`);
      setMessage({
        tone: warnings.length ? 'warn' : 'ok',
        text: confirm
          ? `Confirmed. ${pendingCount} reminder${pendingCount === 1 ? '' : 's'} saved in the vault${caps?.mobile ? ` and ${sync.scheduled} scheduled on this device` : ''}.${warnings.length ? ' ' + warnings.join(' ') : ''}`
          : 'Saved as draft. Reminders start when you confirm it.',
      });
      setForm(emptyForm(form.timeZone));
      setShowForm(false);
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDraft(a: ReminderAppointment) {
    setBusy(true);
    try {
      const res = await reminderApi.save({ ...a, status: 'confirmed' });
      setPermission(await askNotificationPermission());
      await applySaveResult(res);
      setMessage({ tone: res.warnings.length ? 'warn' : 'ok', text: `Confirmed "${a.title}".${res.warnings.length ? ' ' + res.warnings.join(' ') : ''}` });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppt(a: ReminderAppointment) {
    const reason = window.prompt(`Cancel reminders for "${a.title}"? Enter a reason for the record:`, 'Rescheduled by the court');
    if (reason === null) return;
    const res = await reminderApi.cancelAppointment(a.id, reason || 'Cancelled by user');
    await applySaveResult(res);
    setMessage({ tone: 'ok', text: `Cancelled "${a.title}". The change is recorded in the audit ledger.` });
    await load();
  }

  async function saveDefaults() {
    if (!settings) return;
    try {
      const next = await reminderApi.saveSettings({ ...settings, courtOffsets: parseOffsets(courtDefaults) });
      setSettings(next);
      setCourtDefaults(next.courtOffsets.map(fmtOffset).join(', '));
      setMessage({ tone: 'ok', text: 'Default court reminder intervals saved. They apply to court dates you confirm from now on.' });
    } catch (err) {
      setMessage({ tone: 'error', text: String(err) });
    }
  }

  const tone = message?.tone === 'ok' ? 'badge-green' : message?.tone === 'warn' ? 'badge-amber' : 'badge-red';

  return (
    <div data-testid="reminders-page">
      <div className="page-header">
        <h2>Court &amp; Appointment Reminders</h2>
        <p>Reminders are stored in your vault and scheduled on this device. They keep working without internet or the desktop.</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }} data-testid="reminder-reliability">
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <ShieldAlert size={20} style={{ flex: '0 0 auto', marginTop: 2 }} />
          <div style={{ fontSize: 14, lineHeight: 1.55 }}>
            <strong>Notifications: </strong>
            <span className={`badge ${permission === 'granted' ? 'badge-green' : 'badge-red'}`} data-testid="reminder-permission">{permission === 'granted' ? 'On' : permission === 'unavailable' ? 'Unavailable' : 'Off'}</span>
            {permission !== 'granted' && permission !== 'unavailable' && (
              <>
                {' '}
                <button className="btn btn-ghost btn-sm" onClick={async () => setPermission(await askNotificationPermission())} data-testid="reminder-permission-button">Turn on</button>
                <span style={{ display: 'block', marginTop: 6 }}>If nothing happens, open your phone's Settings → Apps → POPS → Notifications and allow them.</span>
              </>
            )}
            <p style={{ margin: '8px 0 0' }}>
              POPS uses several independent safeguards, but no phone app can guarantee every alert is seen. Battery savers, Do Not Disturb, a phone that is switched off or notifications turned off can stop alerts.
              {caps?.platform === 'android' && ' On Android, allow "Alarms & reminders" for POPS and turn off battery optimization for it.'}
              {caps && !caps.mobile && ' On desktop, reminders alert only while POPS is open. Keep POPS on your phone for alerts away from the computer.'}
            </p>
          </div>
        </div>
      </div>

      {message && <div className={`badge ${tone}`} style={{ display: 'block', padding: '10px 12px', marginBottom: 16, whiteSpace: 'normal', lineHeight: 1.5 }} data-testid="reminder-message">{message.text}</div>}

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)} data-testid="reminder-new-button"><Plus size={16} /> New reminder</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }} data-testid="reminder-form">
          <div className="form-group">
            <label>Type</label>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ReminderKind })} data-testid="reminder-kind">
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Status hearing, Courtroom 4B" data-testid="reminder-title" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="reminder-date" /></div>
            <div className="form-group"><label>Time (at the venue)</label><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} data-testid="reminder-time" /></div>
          </div>
          <div className="form-group">
            <label>{form.kind === 'court' ? "Court's time zone" : 'Time zone'}</label>
            <select value={form.timeZone} onChange={(e) => setForm({ ...form, timeZone: e.target.value })} data-testid="reminder-timezone">
              {zoneOptions(form.timeZone).map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Location</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="District Court, 1437 Bannock St" data-testid="reminder-location" /></div>
          <div className="form-group">
            <label>Reminder intervals (blank = defaults: {form.kind === 'court' ? settings?.courtOffsets.map(fmtOffset).join(', ') : settings?.appointmentOffsets.map(fmtOffset).join(', ')})</label>
            <input value={form.offsets} onChange={(e) => setForm({ ...form, offsets: e.target.value })} placeholder="e.g. 7d, 3d, 24h, 3h, 1h" data-testid="reminder-offsets" />
          </div>
          <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          {form.kind === 'court' && <p style={{ fontSize: 13, opacity: 0.85 }}>Court dates are critical. Any reminder you don't mark "Seen it" alerts again 10 and 30 minutes later.</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => void save(true)} data-testid="reminder-confirm-button"><BellRing size={16} /> Confirm &amp; schedule</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void save(false)} data-testid="reminder-draft-button">Save as draft</button>
          </div>
        </div>
      )}

      {upcoming.length === 0 ? (
        <div className="card empty-state"><Gavel size={40} /><p>No upcoming court dates or appointments with reminders.</p></div>
      ) : (
        upcoming.map((a) => (
          <div key={a.id} className="card" style={{ marginBottom: 12 }} data-testid="reminder-appointment">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{a.title}</strong>
                  {a.critical && <span className="badge badge-red">Critical</span>}
                  <span className={`badge ${a.status === 'confirmed' ? 'badge-green' : 'badge-amber'}`}>{a.status === 'confirmed' ? 'Confirmed' : 'Draft'}</span>
                </div>
                <div style={{ fontSize: 14, marginTop: 4 }}>{formatVenueTime(a)} · {a.timeZone}{a.location ? ` · ${a.location}` : ''}</div>
                {a.timeZone !== deviceTimeZone() && <div style={{ fontSize: 13, marginTop: 2, opacity: 0.85 }}>Your time: {new Date(a.startUtc).toLocaleString()} ({deviceTimeZone()})</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {a.status === 'draft' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void confirmDraft(a)}>Confirm</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => void cancelAppt(a)}><XCircle size={14} /> Cancel</button>
              </div>
            </div>
            {a.status === 'confirmed' && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 6 }}>
                {slotsFor(a.id).map((s) => {
                  const st = STATE_LABEL[s.state] ?? { text: s.state, badge: 'badge' };
                  const due = Date.parse(s.fireAtUtc) <= Date.now();
                  const open = ['pending', 'os_scheduled', 'schedule_failed', 'fired'].includes(s.state);
                  return (
                    <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }} data-testid="reminder-slot">
                      <span>{s.label} — {new Date(s.fireAtUtc).toLocaleString()}</span>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className={`badge ${st.badge}`}>{st.text}</span>
                        {due && open && <button className="btn btn-success btn-sm" onClick={() => void acknowledgeSlot(s.id, 'in_app').then(load)} data-testid="reminder-ack-button"><CheckCircle size={14} /> Seen it</button>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-group">
          <label>Default court reminder intervals</label>
          <input value={courtDefaults} onChange={(e) => setCourtDefaults(e.target.value)} data-testid="reminder-court-defaults" />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => void saveDefaults()}>Save defaults</button>
      </div>

      {past.length > 0 && (
        <details className="card" style={{ marginBottom: 16 }}>
          <summary>Past and cancelled ({past.length})</summary>
          {past.map((a) => <div key={a.id} style={{ fontSize: 14, marginTop: 8 }}>{a.title} · {formatVenueTime(a)} · {a.status}</div>)}
        </details>
      )}

      <OperationalRecordsPage config={MODULE_CONFIGS.calendarReminders} />
    </div>
  );
}
