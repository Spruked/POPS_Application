/**
 * Device side of the POPS reminder engine.
 *
 * The Rust engine (src-tauri/src/reminders.rs) decides WHAT fires WHEN and is the
 * only writer of reminder state. This module only mirrors that schedule into the
 * operating system and reports back what happened, so every attempt is audited.
 *
 * - Android / iOS: reminders are handed to the OS notification scheduler, so they
 *   fire with the app closed and without internet.
 * - Desktop: the OS plugin has no scheduler, so a runner fires due reminders while
 *   POPS is open.
 */
import { invoke } from '@tauri-apps/api/core';
import {
  cancel,
  createChannel,
  Importance,
  isPermissionGranted,
  onAction,
  pending,
  registerActionTypes,
  requestPermission,
  Schedule,
  sendNotification,
  Visibility,
} from '@tauri-apps/plugin-notification';
import { getPlatformCapabilities } from './platform';

export type ReminderKind = 'court' | 'attorney' | 'appointment' | 'deadline' | 'other';

export interface ReminderAppointment {
  id: string;
  caseId: string;
  kind: ReminderKind;
  title: string;
  location: string;
  notes: string;
  localStart: string;
  timeZone: string;
  startUtc: string;
  critical: boolean;
  offsets: number[];
  status: 'draft' | 'confirmed' | 'cancelled';
  source: string;
  linkedRecordId?: string | null;
  revision: number;
  recordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderSlot {
  id: string;
  appointmentId: string;
  appointmentRevision: number;
  slotKind: 'reminder' | 'escalation';
  parentSlotId?: string | null;
  offsetMinutes: number;
  fireAtUtc: string;
  label: string;
  critical: boolean;
  state: string;
  notificationId: number;
  acknowledgedAt?: string | null;
  ackSource?: string | null;
  lastEvent?: string | null;
  lastEventAt?: string | null;
}

export interface ReminderSettings {
  courtOffsets: number[];
  appointmentOffsets: number[];
  escalationEnabled: boolean;
  escalationMinutes: number[];
  lastDeviceTimeZone?: string | null;
}

export interface SaveResult {
  appointment: ReminderAppointment;
  slots: ReminderSlot[];
  cancelNotificationIds: number[];
  warnings: string[];
}

const CHANNEL_ID = 'pops-court-reminders';
const ACTION_TYPE = 'pops-reminder';
const ACK_ACTION = 'seen';
/** iOS keeps at most 64 pending local notifications per app; leave headroom. */
const IOS_PENDING_LIMIT = 60;
const ANDROID_PENDING_LIMIT = 400;
const LIVE_STATES = new Set(['pending', 'os_scheduled', 'schedule_failed']);

export type PermissionState = 'granted' | 'denied' | 'default' | 'unavailable';

export const deviceTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export async function notificationPermission(): Promise<PermissionState> {
  try {
    return (await isPermissionGranted()) ? 'granted' : 'default';
  } catch {
    return 'unavailable';
  }
}

/** Ask only after the user confirms a reminder (clear intent). */
export async function askNotificationPermission(): Promise<PermissionState> {
  try {
    if (await isPermissionGranted()) return 'granted';
    const result = await requestPermission();
    return result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'default';
  } catch {
    return 'unavailable';
  }
}

export const reminderApi = {
  settings: () => invoke<ReminderSettings>('get_reminder_settings'),
  saveSettings: (settings: ReminderSettings) => invoke<ReminderSettings>('save_reminder_settings', { settings }),
  appointments: () => invoke<ReminderAppointment[]>('get_reminder_appointments'),
  slots: () => invoke<ReminderSlot[]>('get_reminder_slots', { appointmentId: null }),
  save: (item: Partial<ReminderAppointment>) => invoke<SaveResult>('save_reminder_appointment', { item }),
  cancelAppointment: (id: string, reason: string) => invoke<SaveResult>('cancel_reminder_appointment', { id, reason }),
  due: () => invoke<ReminderSlot[]>('get_due_reminders'),
  event: (slotId: string, event: string, detail?: string) => invoke<ReminderSlot>('record_reminder_event', { slotId, event, detail: detail ?? null }),
  acknowledge: (slotId: string, source: string) => invoke<{ slot: ReminderSlot; cancelNotificationIds: number[] }>('acknowledge_reminder', { slotId, source }),
  timeZone: (timeZone: string) => invoke<{ changed: boolean; previous?: string | null; current: string }>('record_device_time_zone', { timeZone }),
};

export const emitReminderChange = () => window.dispatchEvent(new CustomEvent('pops:reminders-changed'));

async function cancelIds(ids: number[]) {
  if (!ids.length) return;
  try {
    await cancel(ids);
  } catch {
    /* desktop has no pending queue */
  }
}

let channelReady = false;
async function ensureChannel() {
  if (channelReady) return;
  try {
    await createChannel({
      id: CHANNEL_ID,
      name: 'Court & appointment reminders',
      description: 'Court dates, attorney meetings and appointments',
      importance: Importance.High,
      visibility: Visibility.Private,
      vibration: true,
      lights: true,
    });
  } catch {
    /* iOS / desktop have no channels */
  }
  try {
    await registerActionTypes([{ id: ACTION_TYPE, actions: [{ id: ACK_ACTION, title: 'Seen it', foreground: false }] }]);
  } catch {
    /* action buttons unsupported on this platform */
  }
  channelReady = true;
}

function notificationBody(slot: ReminderSlot, appt?: ReminderAppointment): string {
  if (!appt) return slot.label;
  const when = formatVenueTime(appt);
  return `${slot.label} · ${when}${appt.location ? ` · ${appt.location}` : ''}. Tap "Seen it" to confirm.`;
}

export function formatVenueTime(appt: Pick<ReminderAppointment, 'startUtc' | 'timeZone'>): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: appt.timeZone, timeZoneName: 'short' }).format(new Date(appt.startUtc));
  } catch {
    return new Date(appt.startUtc).toLocaleString();
  }
}

/** Mirrors the engine's live slots into the phone's notification scheduler. */
export async function syncDeviceReminders(): Promise<{ scheduled: number; failed: number; deferred: number; permission: PermissionState }> {
  const caps = await getPlatformCapabilities();
  const permission = await notificationPermission();
  const result = { scheduled: 0, failed: 0, deferred: 0, permission };
  if (!caps.mobile) return result;
  const [slots, appts] = await Promise.all([reminderApi.slots(), reminderApi.appointments()]);
  const byId = new Map(appts.map((a) => [a.id, a]));
  const now = Date.now();
  const live = slots
    .filter((s) => LIVE_STATES.has(s.state) && Date.parse(s.fireAtUtc) > now && byId.get(s.appointmentId)?.status === 'confirmed')
    // Court first, then soonest.
    .sort((a, b) => Number(b.critical) - Number(a.critical) || a.fireAtUtc.localeCompare(b.fireAtUtc));
  const limit = caps.platform === 'ios' ? IOS_PENDING_LIMIT : ANDROID_PENDING_LIMIT;
  const wanted = live.slice(0, limit);
  result.deferred = live.length - wanted.length;
  const wantedIds = new Set(wanted.map((s) => s.notificationId));

  let pendingIds = new Set<number>();
  try {
    pendingIds = new Set((await pending()).map((p) => p.id));
  } catch {
    /* treat as empty */
  }
  // Remove OS entries POPS no longer wants (superseded, acknowledged, cancelled, deferred).
  const knownIds = new Set(slots.map((s) => s.notificationId));
  await cancelIds([...pendingIds].filter((id) => knownIds.has(id) && !wantedIds.has(id)));

  if (permission !== 'granted') {
    for (const s of wanted.filter((w) => w.state !== 'schedule_failed')) {
      await reminderApi.event(s.id, 'schedule_failed', `notification permission: ${permission}`);
      result.failed += 1;
    }
    return result;
  }
  await ensureChannel();
  for (const slot of wanted) {
    if (pendingIds.has(slot.notificationId) && slot.state === 'os_scheduled') continue;
    try {
      sendNotification({
        id: slot.notificationId,
        channelId: CHANNEL_ID,
        title: `${slot.critical ? '⚖️ ' : ''}${byId.get(slot.appointmentId)?.title ?? 'POPS reminder'}`,
        body: notificationBody(slot, byId.get(slot.appointmentId)),
        schedule: Schedule.at(new Date(slot.fireAtUtc), false, true),
        actionTypeId: ACTION_TYPE,
        extra: { slotId: slot.id },
        autoCancel: false,
      });
      await reminderApi.event(slot.id, 'os_scheduled', `${caps.platform} local notification #${slot.notificationId}`);
      result.scheduled += 1;
    } catch (err) {
      await reminderApi.event(slot.id, 'schedule_failed', String(err));
      result.failed += 1;
    }
  }
  return result;
}

export async function acknowledgeSlot(slotId: string, source: string) {
  const res = await reminderApi.acknowledge(slotId, source);
  await cancelIds(res.cancelNotificationIds);
  emitReminderChange();
  return res;
}

export async function applySaveResult(res: SaveResult) {
  await cancelIds(res.cancelNotificationIds);
  emitReminderChange();
  return syncDeviceReminders();
}

const firedThisSession = new Set<string>();

/** Desktop: fire due reminders while POPS is open. Mobile: OS already fired; log what is due. */
async function runDueCheck(onDue: (slots: ReminderSlot[]) => void) {
  const caps = await getPlatformCapabilities();
  const due = await reminderApi.due();
  for (const slot of due) {
    if (firedThisSession.has(slot.id)) continue;
    firedThisSession.add(slot.id);
    if (!caps.mobile && slot.state !== 'fired') {
      try {
        sendNotification({ title: `${slot.critical ? '⚖️ ' : ''}POPS reminder`, body: `${slot.label}. Open POPS and tap "Seen it" to confirm.` });
        await reminderApi.event(slot.id, 'fired', 'desktop runner');
      } catch (err) {
        await reminderApi.event(slot.id, 'schedule_failed', `desktop notify: ${String(err)}`);
      }
    } else if (caps.mobile && slot.state === 'os_scheduled') {
      await reminderApi.event(slot.id, 'os_delivered', 'due time passed while scheduled with the OS');
    }
  }
  onDue(due);
}

/**
 * Starts the runtime once per app session. Returns a stop function.
 * `onDue` receives due-but-unacknowledged slots; `onTimeZoneChange` fires when the device zone moved.
 */
export function startReminderRuntime(onDue: (slots: ReminderSlot[]) => void, onTimeZoneChange: (prev: string, next: string) => void): () => void {
  let stopped = false;
  const tick = () => void runDueCheck(onDue).catch(() => undefined);
  const checkZone = async () => {
    try {
      const r = await reminderApi.timeZone(deviceTimeZone());
      if (r.changed && r.previous) {
        onTimeZoneChange(r.previous, r.current);
        await syncDeviceReminders();
      }
    } catch {
      /* backend unavailable (browser dev) */
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      void checkZone();
      void syncDeviceReminders().catch(() => undefined);
      tick();
    }
  };
  let unlisten: (() => void) | undefined;
  void onAction((event) => {
    const slotId = event.notification?.extra?.slotId as string | undefined;
    // Only the explicit "Seen it" action acknowledges; a tap just opens POPS.
    if (slotId && event.actionId === ACK_ACTION) void acknowledgeSlot(slotId, 'notification_action');
  })
    .then((listener) => {
      unlisten = () => void listener.unregister();
      if (stopped) unlisten();
    })
    .catch(() => undefined);
  void checkZone();
  void syncDeviceReminders().catch(() => undefined);
  tick();
  const timer = window.setInterval(tick, 30_000);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    unlisten?.();
  };
}
