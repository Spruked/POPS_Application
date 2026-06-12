import { BadgeCheck, Download, KeyRound, Mail, ShieldCheck, Users } from 'lucide-react';

const memberCards = [
  { label: 'Member Account', value: 'Local profile', detail: 'Account portal link and local identity status', icon: Users, tone: 'blue' },
  { label: 'License Status', value: 'Ready', detail: 'Desktop POPS validates local access token', icon: KeyRound, tone: 'blue' },
  { label: 'Download Access', value: 'Available', detail: 'Installer and release package access', icon: Download, tone: 'blue' },
  { label: 'Review Gates', value: 'Active', detail: 'Exports and record changes require confirmation', icon: ShieldCheck, tone: 'red' },
] as const;

const memberActions = [
  'Member account',
  'Checkout/payment status',
  'Download access',
  'License status',
  'Newsletter opt-in',
  'Event registration',
  'Lifeline request status',
  'Sponsor history',
];

export default function MemberCommand() {
  return (
    <div className="member-command-shell">
      <section className="member-header">
        <div>
          <h2>MEMBER COMMAND</h2>
          <p>Membership, license, download, and account access for the POPS desktop app.</p>
        </div>
        <div className="pipeline-pill">
          <span className="live-dot" />
          <div>
            <strong>ACCESS STATUS</strong>
            <p>Local validation ready</p>
          </div>
        </div>
      </section>

      <section className="member-stats-grid">
        {memberCards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className={`member-stat-card ${card.tone}`}>
              <div className="member-stat-head">
                <h3>{card.label}</h3>
                <Icon size={16} />
              </div>
              <div className="member-stat-value member-status-value">{card.value}</div>
              <div className="member-stat-delta">{card.detail}</div>
            </article>
          );
        })}
      </section>

      <section className="member-portal-card">
        <h3>WEBSITE MEMBER SYSTEM</h3>
        <p>
          Website handles membership, checkout, newsletter, events, downloads, and license access.
          Desktop POPS validates license/access token and links users to account portal actions.
        </p>
        <div className="member-chip-wrap">
          {memberActions.map((action) => (
            <span className="member-chip" key={action}>{action}</span>
          ))}
        </div>
      </section>

      <section className="member-activity-card">
        <div className="member-activity-head">
          <h3>MEMBER FOLLOW-UP</h3>
        </div>

        <div className="member-activity-row">
          <div className="activity-dot blue" />
          <div className="member-activity-time">Portal</div>
          <div className="member-activity-body">
            <div className="member-activity-title">Account, license, and download actions stay under Members.</div>
            <div className="member-activity-subtitle">The main Dashboard remains the app landing page and case overview.</div>
          </div>
          <div className="member-tag blue">MEMBERS</div>
        </div>

        <div className="member-activity-row">
          <div className="activity-dot blue" />
          <div className="member-activity-time">Access</div>
          <div className="member-activity-body">
            <div className="member-activity-title">Member workflows link out to website account actions when needed.</div>
            <div className="member-activity-subtitle">Local app records remain separate from public website membership flows.</div>
          </div>
          <div className="member-tag blue">ACCESS</div>
        </div>
      </section>

      <section className="member-portal-card">
        <h3>MEMBER CONTROLS</h3>
        <div className="member-chip-wrap">
          <span className="member-chip"><BadgeCheck size={14} /> Verify access</span>
          <span className="member-chip"><KeyRound size={14} /> Check license</span>
          <span className="member-chip"><Download size={14} /> Download package</span>
          <span className="member-chip"><Mail size={14} /> Account portal</span>
        </div>
      </section>
    </div>
  );
}
