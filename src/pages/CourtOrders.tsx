import { useState } from 'react';
import { Gavel, Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { useOrderStore, useViolationStore } from '../hooks/useStore';
import { useToast } from '../hooks/useToast';
import { generateId, formatDate } from '../utils/helpers';
import Modal from '../components/Modal';
import type { CourtOrder, Violation } from '../types';

const SEVERITY_OPTIONS = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'major', label: 'Major' },
  { value: 'critical', label: 'Critical' },
];

export default function CourtOrders() {
  const { items: orders, add: addOrder, remove: removeOrder } = useOrderStore();
  const { items: violations, add: addViolation, remove: removeViolation, getByOrder } = useViolationStore();
  const { show } = useToast();
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isViolationModalOpen, setIsViolationModalOpen] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [orderForm, setOrderForm] = useState({ title: '', orderDate: '', effectiveDate: '', judgeName: '', courtName: '', docketNumber: '', terms: '' });
  const [violationForm, setViolationForm] = useState({ date: '', description: '', severity: 'moderate' as Violation['severity'] });

  function handleSaveOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!orderForm.title.trim()) return;
    const order: CourtOrder = {
      id: generateId(),
      title: orderForm.title,
      orderDate: orderForm.orderDate,
      effectiveDate: orderForm.effectiveDate,
      judgeName: orderForm.judgeName,
      courtName: orderForm.courtName,
      docketNumber: orderForm.docketNumber,
      terms: orderForm.terms,
      violations: [],
      createdAt: new Date().toISOString(),
    };
    addOrder(order);
    show('Court order saved');
    setIsOrderModalOpen(false);
    setOrderForm({ title: '', orderDate: '', effectiveDate: '', judgeName: '', courtName: '', docketNumber: '', terms: '' });
  }

  function handleSaveViolation(e: React.FormEvent) {
    e.preventDefault();
    if (!violationForm.description.trim() || !selectedOrderId) return;
    const violation: Violation = {
      id: generateId(),
      orderId: selectedOrderId,
      date: violationForm.date || new Date().toISOString().split('T')[0],
      description: violationForm.description,
      evidenceIds: [],
      severity: violationForm.severity,
      status: 'reported',
      createdAt: new Date().toISOString(),
    };
    addViolation(violation);
    show('Violation recorded');
    setIsViolationModalOpen(false);
    setViolationForm({ date: '', description: '', severity: 'moderate' });
  }

  function openViolationModal(orderId: string) {
    setSelectedOrderId(orderId);
    setIsViolationModalOpen(true);
  }

  return (
    <div>
      <div className="page-header">
        <h2>Court Orders</h2>
        <p>Track court orders and record violations against them</p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={() => setIsOrderModalOpen(true)}>
          <Plus size={16} /> Add Court Order
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="card empty-state">
          <Gavel size={48} />
          <p>No court orders yet. Add your first court order to begin tracking.</p>
        </div>
      ) : (
        orders.map(order => {
          const orderViolations = getByOrder(order.id);
          const isExpanded = expandedOrder === order.id;
          return (
            <div key={order.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <Gavel size={18} className="trust-blue" />
                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>{order.title}</h3>
                    {orderViolations.length > 0 && (
                      <span className="badge badge-red">
                        <AlertTriangle size={10} style={{ marginRight: 4 }} />
                        {orderViolations.length} violation{orderViolations.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {order.courtName} &middot; Judge {order.judgeName} &middot; Docket {order.docketNumber}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Ordered: {formatDate(order.orderDate)} &middot; Effective: {formatDate(order.effectiveDate)}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openViolationModal(order.id); }}>
                    <AlertTriangle size={14} /> Log Violation
                  </button>
                  {isExpanded ? <ChevronUp size={18} color="var(--text-muted)" /> : <ChevronDown size={18} color="var(--text-muted)" />}
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
                  <h4 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                    Order Terms
                  </h4>
                  <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 20 }}>{order.terms}</p>

                  <h4 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                    Recorded Violations
                  </h4>
                  {orderViolations.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No violations recorded for this order.</p>
                  ) : (
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Severity</th>
                            <th>Description</th>
                            <th>Status</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderViolations.map(v => (
                            <tr key={v.id}>
                              <td>{formatDate(v.date)}</td>
                              <td>
                                <span className={`badge badge-${v.severity === 'minor' ? 'green' : v.severity === 'moderate' ? 'amber' : v.severity === 'major' ? 'red' : 'red'}`}>
                                  {v.severity}
                                </span>
                              </td>
                              <td>{v.description}</td>
                              <td><span className="badge badge-amber">{v.status}</span></td>
                              <td>
                                <button className="btn btn-ghost btn-sm" onClick={() => { removeViolation(v.id); show('Violation removed'); }}>
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
              )}
            </div>
          );
        })
      )}

      {/* Add Order Modal */}
      <Modal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        title="Add Court Order"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setIsOrderModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveOrder}>Save Order</button>
          </>
        }
      >
        <form onSubmit={handleSaveOrder} className="form-grid">
          <div className="form-group">
            <label>Order Title</label>
            <input value={orderForm.title} onChange={e => setOrderForm({ ...orderForm, title: e.target.value })} placeholder="e.g., Temporary Custody Order" />
          </div>
          <div className="form-group">
            <label>Court Name</label>
            <input value={orderForm.courtName} onChange={e => setOrderForm({ ...orderForm, courtName: e.target.value })} placeholder="e.g., Superior Court of..." />
          </div>
          <div className="form-group">
            <label>Judge Name</label>
            <input value={orderForm.judgeName} onChange={e => setOrderForm({ ...orderForm, judgeName: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Docket Number</label>
            <input value={orderForm.docketNumber} onChange={e => setOrderForm({ ...orderForm, docketNumber: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Order Date</label>
            <input type="date" value={orderForm.orderDate} onChange={e => setOrderForm({ ...orderForm, orderDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Effective Date</label>
            <input type="date" value={orderForm.effectiveDate} onChange={e => setOrderForm({ ...orderForm, effectiveDate: e.target.value })} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Order Terms / Conditions</label>
            <textarea value={orderForm.terms} onChange={e => setOrderForm({ ...orderForm, terms: e.target.value })} placeholder="Paste the full text of the court order terms here..." />
          </div>
        </form>
      </Modal>

      {/* Add Violation Modal */}
      <Modal
        isOpen={isViolationModalOpen}
        onClose={() => setIsViolationModalOpen(false)}
        title="Log Violation"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setIsViolationModalOpen(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleSaveViolation}>Log Violation</button>
          </>
        }
      >
        <form onSubmit={handleSaveViolation} className="form-grid">
          <div className="form-group">
            <label>Violation Date</label>
            <input type="date" value={violationForm.date} onChange={e => setViolationForm({ ...violationForm, date: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Severity</label>
            <select value={violationForm.severity} onChange={e => setViolationForm({ ...violationForm, severity: e.target.value as Violation['severity'] })}>
              {SEVERITY_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Description</label>
            <textarea value={violationForm.description} onChange={e => setViolationForm({ ...violationForm, description: e.target.value })} placeholder="Describe exactly what happened, when, and how it violates the order..." />
          </div>
        </form>
      </Modal>
    </div>
  );
}
