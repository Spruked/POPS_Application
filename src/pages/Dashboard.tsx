import { Shield, Gavel, AlertTriangle, FileText, Calendar, Activity, Zap, TrendingUp } from 'lucide-react';
import { useEvidenceStore, useOrderStore, useViolationStore, useEventStore } from '../hooks/useStore';
import { formatDate } from '../utils/helpers';

export default function Dashboard() {
  const evidence = useEvidenceStore();
  const orders = useOrderStore();
  const violations = useViolationStore();
  const events = useEventStore();

  const stats = [
    { label: 'Evidence Items', value: evidence.items.length, icon: Shield, color: 'var(--locke-cyan)', key: 'evidence' },
    { label: 'Court Orders', value: orders.items.length, icon: Gavel, color: 'var(--kant-violet)', key: 'orders' },
    { label: 'Violations', value: violations.items.length, icon: AlertTriangle, color: 'var(--spinoza-crimson)', key: 'violations' },
    { label: 'Events Logged', value: events.items.length, icon: Calendar, color: 'var(--hume-amber)', key: 'events' },
  ];

  const allTimeline = [
    ...evidence.items.map(e => ({ ...e, kind: 'evidence' as const, label: `Evidence: ${e.title}` })),
    ...orders.items.map(o => ({ ...o, kind: 'order' as const, label: `Order: ${o.title}` })),
    ...violations.items.map(v => ({ ...v, kind: 'violation' as const, label: `Violation: ${v.description.slice(0, 50)}...` })),
    ...events.items.map(e => ({ ...e, kind: 'event' as const, label: `${e.type}: ${e.title}` })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

  const dotColor: Record<string, string> = {
    evidence: 'green',
    order: 'blue',
    violation: 'red',
    event: 'amber',
  };

  const beamConvergence = violations.items.length > 0 && evidence.items.length > 0 && orders.items.length > 0;

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your case evidence, orders, and activity</p>
      </div>

      {/* TPC Pipeline Status */}
      <div className="card" style={{ marginBottom: 20, padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Activity size={20} className="trust-blue" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>TPC Pipeline Status</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {beamConvergence 
              ? 'All 4 beams converging. Tribunal synthesis available.' 
              : 'Collecting data across beams. Convergence pending.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['locke', 'hume', 'kant', 'spinoza'].map((beam) => {
            const active = beam === 'locke' ? evidence.items.length > 0 
              : beam === 'hume' ? events.items.length > 0
              : beam === 'kant' ? orders.items.length > 0
              : violations.items.length > 0;
            const colors: Record<string, string> = {
              locke: 'var(--locke-cyan)',
              hume: 'var(--hume-amber)',
              kant: 'var(--kant-violet)',
              spinoza: 'var(--spinoza-crimson)',
            };
            return (
              <div key={beam} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: active ? colors[beam] : 'var(--border-dim)',
                  boxShadow: active ? `0 0 10px ${colors[beam]}` : 'none',
                  margin: '0 auto 4px',
                }} />
                <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  {beam[0]}
                </div>
              </div>
            );
          })}
        </div>
        {beamConvergence && (
          <button className="btn btn-primary btn-sm">
            <Zap size={14} /> Synthesize
          </button>
        )}
      </div>

      <div className="stats-grid">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`stat-card stat-${s.key}`}>
              <h4>{s.label}</h4>
              <div className={`value ${s.key}`}>{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* Quick insight */}
      {violations.items.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--spinoza-crimson)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TrendingUp size={18} className="trust-red" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Violation Pattern Detected</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {violations.items.length} violation{violations.items.length !== 1 ? 's' : ''} logged across {orders.items.length} order{orders.items.length !== 1 ? 's' : ''}. 
                {violations.items.filter(v => v.severity === 'critical' || v.severity === 'major').length > 0 && ' Critical severity items present.'}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Recent Activity</h3>
        </div>
        {allTimeline.length === 0 ? (
          <div className="empty-state">
            <Calendar size={48} />
            <p>No activity yet. Start by adding evidence, court orders, or events.</p>
          </div>
        ) : (
          <div className="timeline">
            {allTimeline.map(item => (
              <div key={item.id} className="timeline-item">
                <div className={`timeline-dot ${dotColor[item.kind]}`} />
                <div className="timeline-content">
                  <h4>{item.label}</h4>
                  <p>{item.kind === 'evidence' ? (item as any).description?.slice(0, 100) : ''}</p>
                  <div className="date">{formatDate(item.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
