const PRINCIPLES = [
  {
    title: 'Presence',
    body: 'Presence is not just standing in a place. Presence is effort. It is the call made. The message sent. The arrival at the exchange. The request for records. The follow-up after silence. The calm response when provoked. The lawful attempt when the door does not open. P.O.P.S. helps preserve those attempts so they cannot be erased.',
  },
  {
    title: 'Protection',
    body: 'A father is not only emotionally attached to his child. He is charged with responsibility. Protection means guarding the child, the truth, the record, and the lawful path forward. It does not mean aggression. It does not mean intimidation. It does not mean acting outside the law. It means discipline. It means standing watch over the facts.',
  },
  {
    title: 'Proof',
    body: 'A painful story is not enough in court. A pattern needs structure. An event needs a date. A claim needs evidence. A message needs context. A file needs a hash. A timeline needs custody. A report needs restraint. P.O.P.S. helps turn scattered facts into organized proof.',
  },
  {
    title: 'Restraint',
    body: "Pain can make a person speak in ways that hurt their own case. P.O.P.S. does not erase the pain. It preserves the original words, then helps translate the record into court-safe language. The truth can remain strong without becoming reckless. The system helps the user say what happened clearly, without letting grief, anger, or exhaustion become the other side's exhibit.",
  },
];

export default function Doctrine() {
  return (
    <div>
      <div className="page-header mission-page-header">
        <span className="mission-kicker">The P.O.P.S. Doctrine</span>
        <h2>The Doctrine</h2>
        <p>Proof of Presence is built on four principles.</p>
      </div>
      <section className="mission-panel mission-section-stack">
        <div className="mission-principle-grid">
          {PRINCIPLES.map((principle) => (
            <article className="mission-principle-card" key={principle.title}>
              <h3>{principle.title}</h3>
              <p>{principle.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
