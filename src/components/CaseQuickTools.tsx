import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CalendarClock, FileDown, Zap, UserX } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { generateId, formatDate } from '../utils/helpers';
import type { Evidence, Incident, OperationalRecord } from '../types';

const CHECKLIST_KEY = 'pops.courtChecklist';
const DEFAULT_CHECKLIST = ['Photo ID', 'Court order copies', 'Evidence index / printed PDF', 'Visitation log', 'Witness names & contacts', 'Notes for attorney'];

function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function CourtCountdown() {
  const [hearing, setHearing] = useState<{ date: string; title: string } | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>(() => JSON.parse(localStorage.getItem(CHECKLIST_KEY) || '{}'));

  useEffect(() => {
    invoke<any>('get_case_overview_data')
      .then(d => {
        const c = d?.primaryCase;
        if (c?.nextHearingDate) setHearing({ date: c.nextHearingDate, title: c.courtName || c.title });
      })
      .catch(() => {});
  }, []);

  function toggle(item: string) {
    const next = { ...checked, [item]: !checked[item] };
    setChecked(next);
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next));
  }

  if (!hearing) return null;
  const days = daysUntil(hearing.date);
  const done = DEFAULT_CHECKLIST.filter(i => checked[i]).length;

  return (
    <div className="card" data-testid="court-countdown" style={{ marginBottom: 20, borderLeft: '3px solid var(--kant-violet)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <CalendarClock size={22} color="var(--kant-violet)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Next court date · {hearing.title}</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{formatDate(hearing.date)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: days <= 3 ? 'var(--spinoza-crimson)' : 'var(--kant-violet)' }}>{days < 0 ? 0 : days}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{days === 1 ? 'day left' : 'days left'}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>What to bring ({done}/{DEFAULT_CHECKLIST.length})</div>
      {DEFAULT_CHECKLIST.map(item => (
        <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!checked[item]} onChange={() => toggle(item)} style={{ width: 20, height: 20 }} />
          <span style={{ textDecoration: checked[item] ? 'line-through' : 'none', opacity: checked[item] ? 0.6 : 1 }}>{item}</span>
        </label>
      ))}
    </div>
  );
}

export function QuickIncidentLog({ onSaved }: { onSaved?: () => void }) {
  const { show } = useToast();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  async function save() {
    if (!note.trim()) return;
    setSaving(true);
    const now = new Date();
    const stamp = now.toISOString();
    const item: Evidence = {
      id: generateId(),
      caseId: 'primary',
      type: 'other',
      title: `Quick log – ${now.toLocaleString()}`,
      description: note.trim(),
      date: stamp.split('T')[0],
      sha256: await sha256(`${stamp}\n${note.trim()}`),
      tags: ['quick-log', 'incident'],
      sourceDescription: `Quick incident log recorded in POPS at ${stamp}. Text sealed with SHA-256.`,
      createdAt: stamp,
    } as Evidence;
    try {
      await invoke('save_evidence', { item });
      setNote('');
      setStatus(`Logged and sealed in the Evidence Vault at ${now.toLocaleTimeString()}`);
      show('Logged and sealed in the Evidence Vault');
      onSaved?.();
    } catch (e) {
      setStatus(`Could not save: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" data-testid="quick-incident" style={{ marginBottom: 20, borderLeft: '3px solid var(--spinoza-crimson)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Zap size={18} color="var(--spinoza-crimson)" />
        <div style={{ fontSize: 14, fontWeight: 600 }}>Quick Incident Log</div>
      </div>
      <textarea
        data-testid="quick-incident-note"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="What happened? Time is recorded automatically."
        style={{ width: '100%', minHeight: 70, marginBottom: 10 }}
      />
      <button data-testid="quick-incident-save" className="btn btn-primary" style={{ width: '100%', minHeight: 44 }} disabled={saving || !note.trim()} onClick={save}>
        <Zap size={16} /> {saving ? 'Saving…' : 'Log Now'}
      </button>
      {status && <div data-testid="quick-incident-status" style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>{status}</div>}
    </div>
  );
}

export function MissedVisitTracker() {
  const [rows, setRows] = useState<{ date: string; status: string; notes: string }[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    invoke<OperationalRecord[]>('get_operational_records', { recordType: 'parenting_time_event' })
      .then(records => {
        const visits = records.map(r => {
          const p = r.payload as any;
          return { date: p?.date || r.date, status: String(p?.status || r.status).toLowerCase(), notes: p?.notes || '' };
        });
        const past = visits.filter(v => v.status !== 'scheduled');
        setTotal(past.length);
        setRows(past.filter(v => v.status === 'missed' || v.status === 'denied').sort((a, b) => b.date.localeCompare(a.date)));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="card" data-testid="missed-visits" style={{ marginBottom: 20, borderLeft: '3px solid var(--hume-amber)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <UserX size={20} color="var(--hume-amber)" />
        <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Missed / Denied Visits</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--hume-amber)' }}>{rows.length}</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        {rows.length} of {total} past visits did not happen{total ? ` (${Math.round((rows.length / total) * 100)}%)` : ''}.
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', borderTop: '1px solid var(--border-dim)', fontSize: 13 }}>
          <span style={{ minWidth: 90 }}>{formatDate(r.date)}</span>
          <span className={`badge ${r.status === 'denied' ? 'badge-red' : 'badge-amber'}`}>{r.status}</span>
          <span style={{ color: 'var(--text-muted)' }}>{r.notes}</span>
        </div>
      ))}
    </div>
  );
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function CasePdfExport() {
  const { show } = useToast();
  const [busy, setBusy] = useState(false);

  async function exportPdf() {
    setBusy(true);
    try {
      const [evidence, incidents, reminders] = await Promise.all([
        invoke<Evidence[]>('get_evidence').catch(() => []),
        invoke<Incident[]>('get_incidents').catch(() => []),
        invoke<any[]>('get_reminder_appointments').catch(() => []),
      ]);
      const table = (head: string[], body: unknown[][]) =>
        `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${body.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}">None</td></tr>`}</table>`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>POPS Case Report</title><style>
body{font-family:Arial,sans-serif;color:#111;padding:24px}h1{font-size:20px}h2{font-size:15px;margin-top:24px;border-bottom:1px solid #999}
table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #bbb;padding:4px;text-align:left;vertical-align:top}td.h{font-family:monospace;font-size:9px}
</style></head><body><h1>Proof of Presence – Case Report</h1><div>Generated ${esc(new Date().toLocaleString())}</div>
<h2>Evidence (${evidence.length})</h2>${table(['Date', 'Type', 'Title', 'Description', 'SHA-256'], evidence.map(e => [e.date, e.type, e.title, e.description, e.sha256]))}
<h2>Incidents (${incidents.length})</h2>${table(['Date', 'Type', 'Title', 'Description'], incidents.map(i => [i.date, i.type, i.title, i.description]))}
<h2>Reminders / Court Dates (${reminders.length})</h2>${table(['When', 'Title', 'Location', 'Status'], reminders.map(r => [r.startsAt || r.startAt || r.date, r.title, r.location, r.status]))}
</body></html>`;
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
      document.body.appendChild(frame);
      frame.contentDocument!.write(html);
      frame.contentDocument!.close();
      frame.contentWindow!.focus();
      frame.contentWindow!.print();
      setTimeout(() => frame.remove(), 60000);
      show('Choose "Save as PDF" in the print window');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button data-testid="case-pdf-export" className="btn btn-primary" style={{ width: '100%', minHeight: 44, marginBottom: 20 }} disabled={busy} onClick={exportPdf}>
      <FileDown size={16} /> {busy ? 'Preparing…' : 'Export Court PDF (Evidence, Incidents, Reminders)'}
    </button>
  );
}
