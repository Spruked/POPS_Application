import { useState } from 'react';
import { Calendar, Plus, Trash2, Stethoscope, GraduationCap, DollarSign, Users, MessageSquare, HelpCircle } from 'lucide-react';
import { useEventStore } from '../hooks/useStore';
import { useToast } from '../hooks/useToast';
import { generateId, formatDate } from '../utils/helpers';
import Modal from '../components/Modal';
import type { Event } from '../types';

const EVENT_TYPES = [
  { value: 'medical', label: 'Medical', icon: Stethoscope },
  { value: 'school', label: 'School', icon: GraduationCap },
  { value: 'support', label: 'Support', icon: DollarSign },
  { value: 'visit', label: 'Visit', icon: Users },
  { value: 'communication', label: 'Communication', icon: MessageSquare },
  { value: 'other', label: 'Other', icon: HelpCircle },
];

export default function Events() {
  const { items, add, remove } = useEventStore();
  const { show } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ type: 'medical' as Event['type'], title: '', date: '', description: '' });

  const filtered = items.filter(i => 
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.description.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const event: Event = {
      id: generateId(),
      type: form.type,
      title: form.title,
      date: form.date || new Date().toISOString().split('T')[0],
      description: form.description,
      relatedEvidenceIds: [],
      createdAt: new Date().toISOString(),
    };
    add(event);
    show('Event recorded');
    setIsModalOpen(false);
    setForm({ type: 'medical', title: '', date: '', description: '' });
  }

  function getIcon(type: string) {
    const found = EVENT_TYPES.find(t => t.value === type);
    return found ? found.icon : HelpCircle;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Events & Timeline</h2>
        <p>Log medical visits, school events, support payments, visitations, and communications</p>
      </div>

      <div className="search-bar">
        <Calendar size={18} color="var(--text-muted)" />
        <input placeholder="Search events..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} /> Add Event
        </button>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Calendar size={48} />
            <p>{search ? 'No events match your search.' : 'No events logged yet. Start building your timeline.'}</p>
          </div>
        ) : (
          <div className="timeline">
            {filtered.map(item => {
              const Icon = getIcon(item.type);
              return (
                <div key={item.id} className="timeline-item">
                  <div className={`timeline-dot ${
                    item.type === 'medical' ? 'green' :
                    item.type === 'school' ? 'blue' :
                    item.type === 'support' ? 'amber' :
                    item.type === 'visit' ? 'green' :
                    item.type === 'communication' ? 'blue' : 'amber'
                  }`} />
                  <div className="timeline-content">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Icon size={14} />
                      <h4>{item.title}</h4>
                      <span className={`badge badge-${
                        item.type === 'medical' ? 'green' :
                        item.type === 'school' ? 'blue' :
                        item.type === 'support' ? 'amber' : 'blue'
                      }`} style={{ marginLeft: 'auto' }}>{item.type}</span>
                    </div>
                    <p>{item.description}</p>
                    <div className="date">{formatDate(item.date)}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ position: 'absolute', right: 0, top: 16 }}
                    onClick={() => { remove(item.id); show('Event removed'); }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Event"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit}>Save Event</button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label>Event Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as Event['type'] })}>
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Title</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g., Dentist Appointment" />
          </div>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Details about this event..." />
          </div>
        </form>
      </Modal>
    </div>
  );
}
