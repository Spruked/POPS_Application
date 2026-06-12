const DOCUMENTS = [
  'Denied parenting time.',
  'Blocked communication.',
  'Missed exchanges.',
  'Medical and school exclusion.',
  'Court order issues.',
  'Support and license impacts.',
  'Good-faith efforts.',
  'Messages, photos, receipts, documents, timelines, and records.',
];

const NOT_LIST = [
  'Proof of Presence is not a lawyer.',
  'It is not therapy.',
  'It is not a social network.',
  'It is not a revenge tool.',
  'It is not a surveillance system.',
  'It does not guarantee admissibility.',
];

export default function AboutMission() {
  return (
    <div>
      <div className="page-header mission-page-header">
        <span className="mission-kicker">Proof of Presence</span>
        <h2>About P.O.P.S.</h2>
        <p>Proof of Presence doctrine, purpose, and operating path.</p>
      </div>

      <section className="mission-hero-card">
        <img src="/popsbadge.png" alt="POPS logo" />
        <div>
          <span className="mission-kicker">The First Order of Protection</span>
          <h1>Proof of Presence</h1>
          <p>Protect the Record. Preserve the Truth.</p>
        </div>
      </section>

      <section className="mission-panel mission-section-stack">
        <div className="mission-section-rule"><span>What P.O.P.S. Means</span></div>
        <p>P.O.P.S. stands for Proof of Presence System.</p>
        <p>It is a local-first, forensic-aware evidence and case organization tool built to help parents document the moments that matter:</p>
        <div className="mission-chip-grid">
          {DOCUMENTS.map((item) => <span key={item}>{item}</span>)}
        </div>
        <p>The purpose is not to create conflict.</p>
        <p>The purpose is to create a record.</p>
        <p>Proof of Presence gives those fragments structure.</p>
        <p>It turns chaos into chronology.</p>
        <p>It turns emotion into facts.</p>
        <p>It turns facts into proof.</p>
        <p>It turns proof into a responsible case record.</p>
      </section>

      <section className="mission-panel mission-section-stack">
        <div className="mission-section-rule"><span>What P.O.P.S. Is Not</span></div>
        <div className="mission-chip-grid">
          {NOT_LIST.map((item) => <span key={item}>{item}</span>)}
        </div>
        <p>It is a disciplined evidence system.</p>
        <p>When presence is questioned, the record speaks.</p>
      </section>
    </div>
  );
}
