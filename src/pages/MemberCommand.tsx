import { CalendarDays, FileText, Gavel, ShieldAlert } from 'lucide-react';

const statCards = [
  { label: 'Evidence Items', value: 248, delta: '+12 this week', icon: FileText, tone: 'blue' },
  { label: 'Court Orders', value: 17, delta: 'Active orders', icon: Gavel, tone: 'blue' },
  { label: 'Violations', value: 5, delta: 'Needs review', icon: ShieldAlert, tone: 'red' },
  { label: 'Events Logged', value: 63, delta: '+8 this week', icon: CalendarDays, tone: 'blue' },
] as const;

const activity = [
  {
    time: '10:42 AM',
    title: 'Evidence uploaded: Surveillance Footage_0424.mp4',
    subtitle: 'Evidence Vault',
    tag: 'EVIDENCE',
    tone: 'blue',
  },
  {
    time: '09:15 AM',
    title: 'Court Order issued by Hon. Ramirez',
    subtitle: 'Custody Order - CO-2025-0418',
    tag: 'COURT ORDER',
    tone: 'blue',
  },
  {
    time: '08:03 AM',
    title: 'Violation detected: Communication Restriction',
    subtitle: 'Subject: J.D.  -  Severity: High',
    tag: 'VIOLATION',
    tone: 'red',
  },
  {
    time: 'Yesterday',
    title: 'Event logged: Client Meeting',
    subtitle: 'Case Strategy Review',
    tag: 'EVENT',
    tone: 'blue',
  },
] as const;

export default function MemberCommand() {
  return (
    <div className="member-command-shell">
      <section className="member-header">
        <div>
          <h2>DASHBOARD</h2>
          <p>Real-time overview of your case intelligence.</p>
        </div>
        <div className="pipeline-pill">
          <span className="live-dot" />
          <div>
            <strong>TPC PIPELINE STATUS</strong>
            <p>Convergence pending</p>
          </div>
        </div>
      </section>

      <section className="member-stats-grid">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className={`member-stat-card ${card.tone}`}>
              <div className="member-stat-head">
                <h3>{card.label}</h3>
                <Icon size={16} />
              </div>
              <div className="member-stat-value">{card.value}</div>
              <div className="member-stat-delta">{card.delta}</div>
            </article>
          );
        })}
      </section>

      <section className="member-activity-card">
        <div className="member-activity-head">
          <h3>RECENT ACTIVITY</h3>
        </div>

        {activity.map((item, idx) => (
          <div key={item.time + item.title} className="member-activity-row">
            <div className={`activity-dot ${item.tone}`} />
            <div className="member-activity-time">{item.time}</div>
            <div className="member-activity-body">
              <div className="member-activity-title">{item.title}</div>
              <div className="member-activity-subtitle">{item.subtitle}</div>
            </div>
            <div className={`member-tag ${item.tone}`}>{item.tag}</div>
            {idx < activity.length - 1 && <div className="row-divider" />}
          </div>
        ))}
      </section>

      <section className="member-portal-card">
        <h3>WEBSITE MEMBER SYSTEM</h3>
        <p>
          Website handles membership, checkout, newsletter, events, downloads, and license access.
          Desktop POPS only validates license/access token and links users to account portal actions.
        </p>
        <div className="member-chip-wrap">
          <span className="member-chip">Member account</span>
          <span className="member-chip">Checkout/payment status</span>
          <span className="member-chip">Download access</span>
          <span className="member-chip">License status</span>
          <span className="member-chip">Newsletter opt-in</span>
          <span className="member-chip">Event registration</span>
          <span className="member-chip">Lifeline request status</span>
          <span className="member-chip">Sponsor history</span>
        </div>
      </section>
    </div>
  );
}
