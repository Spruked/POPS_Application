import { DECLARATION_ARTICLES } from '../data/doctrine';

export default function Declaration() {
  return (
    <div className="formal-doc-page">
      <div className="formal-doc-crest">
        <img src="/popsbadge.png" alt="POPS logo" />
      </div>

      <div className="formal-doc">
        <h1>The P.O.P.S.<br />Declaration</h1>
        <div className="formal-doc-subtitle">Proof of Presence System &middot; First Order of Protection</div>

        <div className="formal-doc-rule"><span>Preamble</span></div>
        <p className="formal-doc-lede">
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

        <div className="formal-doc-rule"><span>The Articles</span></div>
        <div className="formal-article-list">
          {DECLARATION_ARTICLES.map((article) => (
            <article className="formal-article" key={article.number}>
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
