import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, CalendarDays, Link2, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import { usePlatformCapabilities } from '../utils/platform';
import { applySaveResult, formatVenueTime, type ReminderAppointment } from '../utils/reminderRuntime';

interface SyncPeer { id: string; role: string; name: string; urls: string[]; createdAt: string; lastSyncAt?: string | null; revoked: boolean }
interface SyncConflict { id: string; appointmentId: string; side: string; local: ReminderAppointment; remote: ReminderAppointment; detectedAt: string }
interface GcalStatus { clientIdSet: boolean; connected: boolean; emailReminders: boolean; connectedAt?: string | null; linkedEvents: number }
interface GcalSyncResult { created: number; updated: number; deleted: number; unchanged: number; changedInGoogle: string[]; errors: string[] }
interface SyncOutcome { url: string; received: number; applied: number; sent: number; accepted: number; conflicts: number; acksSent: number; cancelNotificationIds: number[] }

export async function runPhoneSync(): Promise<SyncOutcome> {
  const out = await invoke<SyncOutcome>('sync_now');
  await applySaveResult({ appointment: {} as ReminderAppointment, slots: [], cancelNotificationIds: out.cancelNotificationIds, warnings: [] });
  return out;
}

function Version({ a, label }: { a: ReminderAppointment; label: string }) {
  return (
    <div style={{ flex: '1 1 220px', fontSize: 14, lineHeight: 1.5 }}>
      <strong>{label}</strong>
      <div>{a.title}</div>
      <div>{formatVenueTime(a)} · {a.timeZone}</div>
      {a.location && <div>{a.location}</div>}
      <div style={{ opacity: 0.7 }}>{a.status} · revision {a.revision}</div>
    </div>
  );
}

export default function DeviceSync() {
  const caps = usePlatformCapabilities();
  const [peers, setPeers] = useState<SyncPeer[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('My phone');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const mobile = !!caps?.mobile;
  const [gcal, setGcal] = useState<GcalStatus | null>(null);
  const [clientId, setClientId] = useState('');

  const load = useCallback(async () => {
    try {
      setPeers(await invoke<SyncPeer[]>('sync_list_peers'));
      setConflicts(await invoke<SyncConflict[]>('sync_get_conflicts'));
      setGcal(await invoke<GcalStatus>('gcal_status').catch(() => null));
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    }
  }, []);
  useEffect(() => void load(), [load]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: String(e) }); }
    setBusy(false);
    await load();
  };

  const startServer = () => run(async () => {
    const urls = await invoke<string[]>('sync_start_server');
    setLanUrls(urls);
    return `Desktop sync is listening${urls.length ? ` on ${urls.join(', ')}` : ''}. Keep POPS open on this computer while phones sync.`;
  });
  const createPairing = () => run(async () => {
    await invoke<string[]>('sync_start_server').then(setLanUrls);
    const c = await invoke<string>('sync_create_pairing', { deviceName, remoteUrl: remoteUrl.trim() || null });
    setCode(c);
    return 'Pairing code created. Enter it on the phone in Settings → Device Sync. Treat it like a password.';
  });
  const join = () => run(async () => {
    const peer = await invoke<SyncPeer>('sync_join_pairing', { code });
    setCode('');
    const out = await runPhoneSync().catch((e) => { throw new Error(`Paired with ${peer.name}, but the first sync failed: ${String(e)}`); });
    return `Paired with ${peer.name}. First sync: ${out.received} received, ${out.applied} updated on this phone, ${out.sent} sent.`;
  });
  const syncNow = () => run(async () => {
    const o = await runPhoneSync();
    return `Synced via ${o.url.includes('https://') ? 'secure gateway' : 'same Wi-Fi'}: ${o.received} received, ${o.applied} updated here, ${o.sent} sent (${o.accepted} accepted), ${o.acksSent} "Seen it" sent${o.conflicts ? `, ${o.conflicts} conflict(s) need your decision` : ''}.`;
  });
  const resolve = (c: SyncConflict, keep: 'local' | 'remote') => run(async () => {
    const ids = await invoke<number[]>('sync_resolve_conflict', { id: c.id, keep });
    await applySaveResult({ appointment: {} as ReminderAppointment, slots: [], cancelNotificationIds: ids, warnings: [] });
    return `Kept the ${keep === 'local' ? 'version on this device' : 'other device\'s version'} of "${c.local.title}". ${mobile ? 'It will be sent on the next sync.' : 'Phones receive it on their next sync.'}`;
  });
  const gcalSave = () => run(async () => { setGcal(await invoke<GcalStatus>('gcal_configure', { clientId, emailReminders: null })); setClientId(''); return 'Google OAuth client ID saved on this computer (not in the vault).'; });
  const gcalEmail = (on: boolean) => run(async () => { setGcal(await invoke<GcalStatus>('gcal_configure', { clientId: null, emailReminders: on })); return on ? 'Email reminders on: Google Calendar will also email you 24 hours before each event. Run Sync to Google to apply this to existing events.' : 'Email reminders off.'; });
  const gcalConnect = () => run(async () => { setGcal(await invoke<GcalStatus>('gcal_connect')); return 'Connected to Google Calendar.'; });
  const gcalDisconnect = () => run(async () => { setGcal(await invoke<GcalStatus>('gcal_disconnect')); return 'Disconnected. Events already in Google Calendar stay there.'; });
  const gcalSync = () => run(async () => {
    const r = await invoke<GcalSyncResult>('gcal_sync');
    return `Google Calendar: ${r.created} added, ${r.updated} updated, ${r.deleted} removed, ${r.unchanged} unchanged.${r.changedInGoogle.length ? ' ' + r.changedInGoogle.join(' ') : ''}${r.errors.length ? ' Errors: ' + r.errors.join('; ') : ''}`;
  });
  const revoke = (p: SyncPeer) => run(async () => { await invoke('sync_revoke_peer', { id: p.id }); return `${p.name} can no longer sync.`; });

  return (
    <div data-testid="device-sync-page">
      <div className="page-header">
        <h2>Device Sync</h2>
        <p>The desktop keeps the authoritative schedule. Phones sync court dates, appointments and "Seen it" confirmations with it, end-to-end encrypted. Reminders already on a phone keep working when the desktop is off.</p>
      </div>

      {msg && <div className={`badge ${msg.ok ? 'badge-green' : 'badge-red'}`} style={{ display: 'block', padding: '10px 12px', marginBottom: 16, whiteSpace: 'normal', lineHeight: 1.5 }} data-testid="sync-message">{msg.text}</div>}

      {conflicts.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: '#ef4444' }} data-testid="sync-conflicts">
          <h3 style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 0 }}><AlertTriangle size={18} /> {conflicts.length} schedule conflict{conflicts.length > 1 ? 's' : ''}</h3>
          <p style={{ fontSize: 14 }}>The desktop and a phone changed the same appointment. Nothing was overwritten. Check with the court or your attorney, then choose the correct version.</p>
          {conflicts.map((c) => (
            <div key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <Version a={c.local} label={mobile ? 'On this phone' : 'On this desktop'} />
                <Version a={c.remote} label={mobile ? 'On the desktop' : 'From the phone'} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void resolve(c, 'local')}>Keep {mobile ? "this phone's" : "the desktop's"} version</button>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void resolve(c, 'remote')}>Use {mobile ? "the desktop's" : "the phone's"} version</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {mobile ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Link2 size={18} /> Pair with your desktop</h3>
          <div className="form-group"><label>Pairing code from POPS Desktop</label><textarea value={code} onChange={(e) => setCode(e.target.value)} placeholder="POPS1.…" rows={3} data-testid="sync-code-input" /></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={busy || !code.trim()} onClick={() => void join()} data-testid="sync-join-button">Pair</button>
            <button className="btn btn-ghost" disabled={busy || !peers.some((p) => p.role === 'desktop' && !p.revoked)} onClick={() => void syncNow()} data-testid="sync-now-button"><RefreshCw size={16} /> Sync now</button>
          </div>
          <p style={{ fontSize: 13, opacity: 0.8 }}>POPS syncs automatically when you open the app and every 5 minutes while it's open. It tries your secure gateway first, then the same Wi-Fi.</p>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Smartphone size={18} /> Pair a phone</h3>
          <div className="form-group"><label>Phone name</label><input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} data-testid="sync-device-name" /></div>
          <div className="form-group"><label>Secure gateway address (optional, for syncing away from home)</label><input value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} placeholder="https://sync.popsproof.com" data-testid="sync-remote-url" /></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => void createPairing()} data-testid="sync-create-pairing">Create pairing code</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void startServer()}>Start desktop sync</button>
          </div>
          {code && <textarea readOnly value={code} rows={4} style={{ width: '100%', marginTop: 12, fontFamily: 'monospace', fontSize: 12 }} data-testid="sync-pairing-code" onFocus={(e) => e.currentTarget.select()} />}
          {lanUrls.length > 0 && <p style={{ fontSize: 13, opacity: 0.8 }}>Same-Wi-Fi address: {lanUrls.join(', ')}. Allow POPS through Windows Firewall when asked.</p>}
        </div>
      )}

      {!mobile && gcal && (
        <div className="card" style={{ marginBottom: 16 }} data-testid="gcal-card">
          <h3 style={{ marginTop: 0, display: 'flex', gap: 8, alignItems: 'center' }}><CalendarDays size={18} /> Google Calendar</h3>
          <p style={{ fontSize: 14, lineHeight: 1.55 }}>Confirmed court dates and appointments are copied to your own Google Calendar with the court's time zone, so they also appear in Google Calendar on your phone. Free, with no monthly fees. Case notes are never sent to Google, and POPS never changes its records based on edits made in Google.</p>
          {!gcal.clientIdSet ? (
            <>
              <div className="form-group"><label>Google OAuth client ID (Desktop app type)</label><input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234567890-abc.apps.googleusercontent.com" data-testid="gcal-client-id" /></div>
              <button className="btn btn-primary btn-sm" disabled={busy || !clientId.trim()} onClick={() => void gcalSave()}>Save client ID</button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className={`badge ${gcal.connected ? 'badge-green' : 'badge-amber'}`}>{gcal.connected ? `Connected · ${gcal.linkedEvents} events linked` : 'Not connected'}</span>
              {gcal.connected ? (
                <>
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void gcalSync()} data-testid="gcal-sync"><RefreshCw size={14} /> Sync to Google</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void gcalDisconnect()}>Disconnect</button>
                </>
              ) : <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void gcalConnect()} data-testid="gcal-connect">Connect Google Calendar</button>}
            </div>
          )}
          {gcal.clientIdSet && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 14 }}>
              <input type="checkbox" checked={gcal.emailReminders} onChange={(e) => void gcalEmail(e.target.checked)} data-testid="gcal-email-toggle" />
              Also send me email reminders 24 hours before (sent free by Google Calendar)
            </label>
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Paired devices</h3>
        {peers.length === 0 ? <p>No paired devices yet.</p> : peers.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0' }}>
            <span>{p.name} · {p.role === 'desktop' ? 'desktop' : 'phone'} · {p.revoked ? 'revoked' : p.lastSyncAt ? `last sync ${new Date(p.lastSyncAt).toLocaleString()}` : 'never synced'}</span>
            {!p.revoked && <button className="btn btn-ghost btn-sm" onClick={() => void revoke(p)}><Trash2 size={14} /> Revoke</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
