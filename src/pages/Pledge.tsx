import { PLEDGE_LINES } from '../data/doctrine';

export default function Pledge() {
  return (
    <div className="formal-doc-page">
      <div className="formal-doc-crest">
        <img src="/popsbadge.png" alt="POPS logo" />
      </div>

      <div className="formal-doc">
        <h1>The Creed &amp;<br />The Pledge</h1>
        <div className="formal-doc-subtitle">First Order of Protection</div>

        <div className="formal-doc-rule"><span>The Creed</span></div>
        <div className="formal-charge">
          <span>The Charge</span>
          <h3>I am the First Order of Protection.</h3>
        </div>

        <div className="formal-lines">
          <p>Before the law arrives, I am here.</p>
          <p>Before the danger is named, I am watching.</p>
          <p>Before my family asks, I have already decided: I will not fail them.</p>
        </div>

        <div className="formal-lines">
          <p>I do not wait for permission to protect what is mine.</p>
          <p>I do not require a title to fulfill a calling.</p>
          <p>My badge is my presence. My oath was sworn the day I accepted this house as my charge.</p>
        </div>

        <div className="formal-mantra">
          <span>Preserve</span>
          <span>Protect</span>
          <span>Prove</span>
        </div>

        <div className="formal-doc-rule"><span>The Pledge of Commitment</span></div>
        <p className="formal-doc-lede">
          I make this pledge not to an institution, but to the ones under my roof, and before the God who placed them in my care.
        </p>

        <div className="formal-pledge-list">
          {PLEDGE_LINES.map((pledge) => (
            <article className="formal-pledge-line" key={pledge.title}>
              <span>{pledge.title}</span>
              <p>{pledge.body}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
