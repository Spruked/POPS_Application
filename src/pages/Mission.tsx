const MISSION_PARAGRAPHS = [
  'There is a place in a father that does not need to be taught.',
  'It is already there.',
  'The instinct to protect.',
  'The need to provide.',
  'The duty to stand between harm and the child.',
  'The responsibility to show up even when nobody is clapping, nobody is watching, and nobody is keeping score.',
  'That duty is not created by a court order.',
  'It is older than that.',
  'It lives somewhere deeper. In conscience. In blood. In faith. In the charge placed inside a man to guard what has been entrusted to him.',
  'For many fathers, that calling is not a slogan. It is the center of who they are.',
  'So when a father is separated from his child, that calling does not disappear.',
  'It becomes trapped.',
  'He is still a protector, but the door is locked.',
  'He is still responsible, but his hands are tied.',
  'He is still expected to provide, but the path is blocked.',
  'He is still called a father, but treated like a visitor.',
  'He still carries the duty, but is denied the place to perform it.',
  'That pain is hard to explain to people who have never lived it.',
  'It is not just sadness.',
  'It is not just anger.',
  'It is not just frustration with paperwork, courts, schedules, or messages that go unanswered.',
  'It is the agony of being built to protect and then being told to stand down.',
  'A guardian standing outside the gate while the world questions whether he ever showed up at all.',
  'That is the place Proof of Presence was built for.',
  'Not to attack.',
  'Not to inflame.',
  'Not to spy.',
  'Not to turn pain into revenge.',
  'Proof of Presence exists to help a father preserve the truth when the truth is being contested.',
  'It exists because sometimes presence is not believed until it is documented.',
  'And when the world asks, "Where is your proof?"',
  'Proof of Presence answers:',
  'Right here.',
];

const HARDEST_DAYS = [
  'This app is built for the hard days.',
  'The parking lot after a missed exchange.',
  'The unanswered message.',
  'The medical appointment learned about too late.',
  'The school record no one sent.',
  'The court order nobody seems to follow.',
  'The receipt that proves the trip was made.',
  'The screenshot that needs context.',
  'The long thread that shows the pattern.',
  'The quiet moment where a man wonders if anyone will ever believe how hard he tried.',
  'P.O.P.S. does not pretend that pain is small.',
  'It does not tell a father to stop feeling what he feels.',
  'It gives him something better to do with it.',
  'It gives the pain a disciplined path.',
  'It gives the protector a post to stand at again.',
];

const PROMISE = [
  'Every attempt matters.',
  'Every lawful effort matters.',
  'Every message matters.',
  'Every date matters.',
  'Every piece of evidence deserves protection.',
  'Proof of Presence exists to preserve truth, protect the record, and help parents build a responsible path through conflict.',
  'It is for the parent who refuses to disappear.',
  'It is for the father who still stands watch.',
  'It is for the man who knows that duty does not end because access was denied.',
];

function Paragraphs({ items }: { items: string[] }) {
  return <>{items.map((item) => <p key={item}>{item}</p>)}</>;
}

export default function Mission() {
  return (
    <div>
      <div className="page-header mission-page-header">
        <span className="mission-kicker">The First Order of Protection</span>
        <h2>The Mission</h2>
        <p>Emotional and spiritual reason POPS exists.</p>
      </div>
      <div className="mission-section-stack">
        <section className="mission-panel"><div className="mission-section-rule"><span>The First Order of Protection</span></div><Paragraphs items={MISSION_PARAGRAPHS} /></section>
        <section className="mission-panel"><div className="mission-section-rule"><span>Built for the Hardest Days</span></div><Paragraphs items={HARDEST_DAYS} /></section>
        <section className="mission-panel mission-promise"><div className="mission-section-rule"><span>The Promise</span></div><Paragraphs items={PROMISE} /></section>
      </div>
    </div>
  );
}
