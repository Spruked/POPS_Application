import { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../hooks/useToast';
import { generateId } from '../utils/helpers';
import { analyzeNarrative } from '../utils/annotationEngine';

type VisitStatus = 'scheduled' | 'completed' | 'denied' | 'missed' | 'late' | 'makeup';

type VisitEntry = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  otherParty: string;
  status: VisitStatus;
  notes: string;
  attemptedContact: string;
  orderReference: string;
  createdAt: string;
};

const STORAGE_KEY = 'pops_visitation_calendar_v1';

const STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  denied: 'Denied',
  missed: 'Missed',
  late: 'Late',
  makeup: 'Make-up',
};

const STATUS_CLASS: Record<VisitStatus, string> = {
  scheduled: 'badge-blue',
  completed: 'badge-green',
  denied: 'badge-red',
  missed: 'badge-amber',
  late: 'badge-amber',
  makeup: 'badge-blue',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function loadEntries(): VisitEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as VisitEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: VisitEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export default function VisitationCalendar() {
  const { show } = useToast();
  const [entries, setEntries] = useState<VisitEntry[]>(() => loadEntries());
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateKey(new Date()));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<Omit<VisitEntry, 'id' | 'createdAt'>>({
    date: toDateKey(new Date()),
    startTime: '',
    endTime: '',
    location: '',
    otherParty: '',
    status: 'scheduled',
    notes: '',
    attemptedContact: '',
    orderReference: '',
  });

  const firstDay = monthCursor.getDay();
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const monthLabel = monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const entriesByDate = useMemo(() => {
    const map: Record<string, VisitEntry[]> = {};
    entries.forEach((entry) => {
      if (!map[entry.date]) map[entry.date] = [];
      map[entry.date].push(entry);
    });
    return map;
  }, [entries]);

  const selectedEntries = (entriesByDate[selectedDate] || []).slice().sort((a, b) => {
    return `${a.startTime}`.localeCompare(`${b.startTime}`);
  });

  function moveMonth(direction: -1 | 1) {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
  }

  function openCreateFor(dateKey: string) {
    setSelectedDate(dateKey);
    setForm((prev) => ({ ...prev, date: dateKey }));
    setIsModalOpen(true);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date || !form.startTime || !form.location.trim()) {
      show('Date, start time, and location are required.', 'error');
      return;
    }

    const created: VisitEntry = {
      id: generateId(),
      ...form,
      location: form.location.trim(),
      otherParty: form.otherParty.trim(),
      notes: form.notes.trim(),
      attemptedContact: form.attemptedContact.trim(),
      orderReference: form.orderReference.trim(),
      createdAt: new Date().toISOString(),
    };

    const next = [created, ...entries];
    setEntries(next);
    saveEntries(next);
    show('Calendar entry saved.');

    const annotation = analyzeNarrative(created.notes || '');
    if (annotation.findings.some((f) => f.label === 'Risk word' || f.label === 'Attorney review')) {
      show('Language flagged for court-safe review.', 'error');
    }

    setIsModalOpen(false);
    setForm((prev) => ({ ...prev, notes: '', attemptedContact: '' }));
  }

  function removeEntry(id: string) {
    const next = entries.filter((entry) => entry.id !== id);
    setEntries(next);
    saveEntries(next);
    show('Calendar entry removed.');
  }

  return (
    <div>
      <div className="page-header">
        <h2>Case Calendar</h2>
        <p>Keep Time. Keep Proof.</p>
      </div>

      <div className="card">
        <div className="viscal-toolbar">
          <button className="btn btn-ghost btn-sm" onClick={() => moveMonth(-1)}>
            <ChevronLeft size={16} />
          </button>
          <h3>{monthLabel}</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => moveMonth(1)}>
            <ChevronRight size={16} />
          </button>
          <button className="btn btn-primary btn-sm viscal-add" onClick={() => openCreateFor(selectedDate)}>
            <Plus size={16} /> Add Entry
          </button>
        </div>

        <div className="viscal-grid-head">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="viscal-grid">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`blank-${i}`} className="viscal-day viscal-day-blank" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateKey = `${monthCursor.getFullYear()}-${pad(monthCursor.getMonth() + 1)}-${pad(day)}`;
            const daily = entriesByDate[dateKey] || [];
            const isSelected = selectedDate === dateKey;
            return (
              <button
                key={dateKey}
                className={`viscal-day ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedDate(dateKey)}
              >
                <div className="viscal-day-num">{day}</div>
                <div className="viscal-day-meta">
                  {daily.length > 0 ? `${daily.length} record${daily.length > 1 ? 's' : ''}` : 'No records'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} /> Entries for {selectedDate}
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={() => openCreateFor(selectedDate)}>
            <Plus size={14} /> Add
          </button>
        </div>

        {selectedEntries.length === 0 ? (
          <div className="empty-state">
            <Calendar size={44} />
            <p>No parenting-time or exchange entries for this date yet.</p>
          </div>
        ) : (
          <div className="timeline">
            {selectedEntries.map((entry) => (
              <div key={entry.id} className="timeline-item">
                <div className={`timeline-dot ${entry.status === 'completed' ? 'green' : entry.status === 'denied' ? 'amber' : 'blue'}`} />
                <div className="timeline-content">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h4>{entry.startTime || '--:--'}{entry.endTime ? ` - ${entry.endTime}` : ''}</h4>
                    <span className={`badge ${STATUS_CLASS[entry.status]}`} style={{ marginLeft: 'auto' }}>
                      {STATUS_LABELS[entry.status]}
                    </span>
                  </div>
                  <p><strong>Location:</strong> {entry.location}</p>
                  {entry.otherParty ? <p><strong>Other party:</strong> {entry.otherParty}</p> : null}
                  {entry.orderReference ? <p><strong>Order link:</strong> {entry.orderReference}</p> : null}
                  {entry.attemptedContact ? <p><strong>Attempted contact:</strong> {entry.attemptedContact}</p> : null}
                  {entry.notes ? <p>{entry.notes}</p> : null}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ position: 'absolute', right: 0, top: 16 }}
                  onClick={() => removeEntry(entry.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Parenting Time / Exchange Entry"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate}>Save Entry</button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="form-grid">
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as VisitStatus })}>
              {Object.keys(STATUS_LABELS).map((key) => (
                <option key={key} value={key}>{STATUS_LABELS[key as VisitStatus]}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Start Time</label>
            <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          </div>
          <div className="form-group">
            <label>End Time</label>
            <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Exchange Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g., School parking lot" />
          </div>
          <div className="form-group">
            <label>Person Involved</label>
            <input value={form.otherParty} onChange={(e) => setForm({ ...form, otherParty: e.target.value })} placeholder="e.g., Mother / Guardian" />
          </div>
          <div className="form-group">
            <label>Order Reference</label>
            <input value={form.orderReference} onChange={(e) => setForm({ ...form, orderReference: e.target.value })} placeholder="Order date / section" />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Attempted Contact</label>
            <input value={form.attemptedContact} onChange={(e) => setForm({ ...form, attemptedContact: e.target.value })} placeholder="Call, text, app message, email" />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Narrative Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Use factual, court-safe language and include linked evidence references." />
          </div>
        </form>
      </Modal>
    </div>
  );
}
