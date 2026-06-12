const PROCESS = [
  { title: 'Capture', body: 'The user records what happened or uploads a document, image, message export, receipt, court order, or other evidence.' },
  { title: 'Preserve', body: 'The original file is copied into protected local storage and hashed with SHA-256 so the system can later verify whether it changed.' },
  { title: 'Extract', body: 'When possible, P.O.P.S. reads the document, image, message export, court record, or screenshot and pulls out dates, times, names, messages, case numbers, order language, and event details. The app should not make the user type what the evidence already contains.' },
  { title: 'Review', body: 'The system presents what it found. The user reviews, corrects, and confirms.' },
  { title: 'Seal', body: 'Once confirmed, the record is sealed, hashed, logged, and preserved in the Evidence Vault and audit ledger.' },
  { title: 'Report', body: 'The system helps generate timelines, evidence indexes, chain-of-custody reports, attorney packets, and court-safe summaries. The user does not have to walk into a serious meeting with a pile of emotional fragments. He can walk in with a record.' },
];

export default function HowItWorks() {
  return (
    <div>
      <div className="page-header mission-page-header">
        <span className="mission-kicker">How P.O.P.S. Works</span>
        <h2>How P.O.P.S. Works</h2>
        <p>Capture {'>'} Preserve {'>'} Extract {'>'} Review {'>'} Seal {'>'} Report.</p>
      </div>
      <section className="mission-panel mission-section-stack">
        <div className="mission-process-grid">
          {PROCESS.map((step, index) => (
            <article className="mission-process-card" key={step.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
