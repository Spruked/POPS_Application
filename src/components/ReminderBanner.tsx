import { useEffect, useState } from 'react';
import { BellRing, CheckCircle, Globe } from 'lucide-react';
import { acknowledgeSlot, startReminderRuntime, type ReminderSlot } from '../utils/reminderRuntime';

/** App-wide banner for due-but-unacknowledged reminders and device time-zone changes. */
export default function ReminderBanner({ onOpen }: { onOpen: () => void }) {
  const [due, setDue] = useState<ReminderSlot[]>([]);
  const [zoneChange, setZoneChange] = useState<{ prev: string; next: string } | null>(null);

  useEffect(() => startReminderRuntime(setDue, (prev, next) => setZoneChange({ prev, next })), []);

  if (!due.length && !zoneChange) return null;
  const first = due[0];
  return (
    <div className="pops-reminder-banner" role="alert" data-testid="reminder-banner">
      {zoneChange && (
        <div className="pops-reminder-banner-row">
          <Globe size={16} />
          <span>Your device time zone changed from {zoneChange.prev} to {zoneChange.next}. Court times stay in the court's own time zone. Please check your reminders.</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setZoneChange(null)}>OK</button>
        </div>
      )}
      {first && (
        <div className="pops-reminder-banner-row">
          <BellRing size={16} />
          <span><strong>{first.critical ? 'Court reminder' : 'Reminder'}:</strong> {first.label}{due.length > 1 ? ` (+${due.length - 1} more)` : ''}</span>
          <button className="btn btn-success btn-sm" onClick={() => void acknowledgeSlot(first.id, 'in_app_banner').then(() => setDue((d) => d.slice(1)))} data-testid="reminder-banner-ack"><CheckCircle size={14} /> Seen it</button>
          <button className="btn btn-ghost btn-sm" onClick={onOpen}>Open</button>
        </div>
      )}
    </div>
  );
}
