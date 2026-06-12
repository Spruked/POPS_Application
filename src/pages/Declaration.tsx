import { DECLARATION_ARTICLES } from '../data/doctrine';

export default function Declaration() {
  return (
    <div>
      <div className="page-header">
        <h2>The P.O.P.S. Declaration</h2>
        <p>First Order of Protection and Service</p>
      </div>

      <div className="doctrine-document card">
        <div className="doctrine-rule"><span>Mission Statement</span></div>
        <p className="doctrine-lede">
          POPS - the Proof of Presence System - exists to restore men to their God-given appointment as the First Order of Protection in the home.
        </p>
        <p>
          It equips fathers with the discipline, record-keeping, and truth-preserving tools needed to stand watch over their families, remain accountable in conflict, and protect what has been entrusted to them.
        </p>
        <p>
          POPS is not a support group. It is a <strong>support machine</strong> - built to keep a man aligned, sober-minded, and anchored to his calling.
        </p>

        <div className="doctrine-rule"><span>Preamble</span></div>
        <p className="doctrine-lede">
          When in the course of a family's life, danger does not announce itself, when the call for help cannot wait for sirens, when the wolf is at the door and the door is the only thing between the wolf and the children, there must stand, in that gap, a man.
        </p>
        <p>Not a badge. Not a uniform. A father.</p>
        <p>
          Before there were Courts of Protection Services, before there were County Officers of Public Safety, before any institution wore the name of guardian, there was the man of the house, standing watch, armed with nothing but resolve and the authority given to him by his Creator.
        </p>
        <p>
          We call this what it has always been: <strong>P.O.P.S. - Proof of Presence System. The First Order of Protection and Service.</strong>
        </p>
        <p>
          This is not a replacement for law. This is the foundation law was built upon. When the C.O.P.S. cannot get there in time, and there will be moments they cannot, the P.O.P.S. is already there.
        </p>

        <div className="doctrine-rule"><span>The Articles</span></div>
        <div className="doctrine-grid">
          {DECLARATION_ARTICLES.map((article) => (
            <article className="doctrine-entry" key={article.number}>
              <span>{article.number}</span>
              <h3>{article.title}</h3>
              <p>{article.body}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
