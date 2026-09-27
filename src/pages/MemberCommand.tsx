import { BadgeCheck, KeyRound, ShieldCheck, Users } from 'lucide-react';

const memberCards = [
  { label: 'User Profile', value: 'Local profile', detail: 'Local identity and workspace status', icon: Users, tone: 'blue' },
  { label: 'License Status', value: 'Ready', detail: 'Desktop POPS validates local access token', icon: KeyRound, tone: 'blue' },
  { label: 'Review Gates', value: 'Active', detail: 'Exports and record changes require confirmation', icon: ShieldCheck, tone: 'red' },
] as const;

const memberActions = [
  'Local profile',
  'License status',
  'Vault status',
  'Audit ledger',
  'Data backup',
  'Security settings',
];

export default function MemberCommand() {
  return (
    <div className="member-command-shell">
      <section className="member-header">
        <div>
          <h2>MEMBER COMMAND</h2>
          <p>Local profile, license, vault, and access status for the POPS desktop app.</p>
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
        <h3>LOCAL ACCESS SYSTEM</h3>
        <p>
          Desktop POPS validates the local license/access token and keeps product records inside the
          local workspace.
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
            <div className="member-activity-title">Profile, license, and vault status stay under Members.</div>
            <div className="member-activity-subtitle">The main Dashboard remains the app landing page and case overview.</div>
          </div>
          <div className="member-tag blue">MEMBERS</div>
        </div>

        <div className="member-activity-row">
          <div className="activity-dot blue" />
          <div className="member-activity-time">Access</div>
          <div className="member-activity-body">
            <div className="member-activity-title">Member workflows stay focused on local product access.</div>
            <div className="member-activity-subtitle">Local app records remain separate from website sales and public pages.</div>
          </div>
          <div className="member-tag blue">ACCESS</div>
        </div>
      </section>

      <section className="member-portal-card">
        <h3>MEMBER CONTROLS</h3>
        <div className="member-chip-wrap">
          <span className="member-chip"><BadgeCheck size={14} /> Verify access</span>
          <span className="member-chip"><KeyRound size={14} /> Check license</span>
          <span className="member-chip"><ShieldCheck size={14} /> Vault status</span>
          <span className="member-chip"><Users size={14} /> Local profile</span>
        </div>
      </section>
    </div>
  );
}
