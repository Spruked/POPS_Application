import { AlertTriangle, Search } from 'lucide-react';
import { useViolationStore, useOrderStore } from '../hooks/useStore';
import { formatDate } from '../utils/helpers';
import { useState } from 'react';

export default function Violations() {
  const { items } = useViolationStore();
  const { items: orders } = useOrderStore();
  const [search, setSearch] = useState('');

  const getOrderTitle = (orderId: string) => orders.find(o => o.id === orderId)?.title || 'Unknown Order';

  const filtered = items.filter(v => 
    v.description.toLowerCase().includes(search.toLowerCase()) ||
    getOrderTitle(v.orderId).toLowerCase().includes(search.toLowerCase())
  );

  const severityOrder = { critical: 4, major: 3, moderate: 2, minor: 1 };
  const sorted = [...filtered].sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

  return (
    <div>
      <div className="page-header">
        <h2>All Violations</h2>
        <p>Complete violation log across all court orders</p>
      </div>

      <div className="search-bar">
        <Search size={18} color="var(--text-muted)" />
        <input placeholder="Search violations..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {sorted.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle size={48} />
            <p>{search ? 'No violations match your search.' : 'No violations recorded yet.'}</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Severity</th>
                  <th>Description</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(v => (
                  <tr key={v.id}>
                    <td><strong>{getOrderTitle(v.orderId)}</strong></td>
                    <td>{formatDate(v.date)}</td>
                    <td>
                      <span className={`badge badge-${v.severity === 'minor' ? 'green' : v.severity === 'moderate' ? 'amber' : 'red'}`}>
                        {v.severity}
                      </span>
                    </td>
                    <td>{v.description}</td>
                    <td><span className="badge badge-amber">{v.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
