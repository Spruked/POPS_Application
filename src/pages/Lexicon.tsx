import { useMemo, useState } from 'react';
import { BookOpenCheck, Highlighter, Search } from 'lucide-react';
import { ANNOTATION_LABELS, POPS_LEXICON } from '../data/lexicon';
import { analyzeNarrative } from '../utils/annotationEngine';

export default function Lexicon() {
  const [query, setQuery] = useState('');
  const [narrative, setNarrative] = useState('She kidnapped my daughter and lied to everyone.');

  const lexicon = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return POPS_LEXICON;
    return POPS_LEXICON.filter(
      (entry) => entry.term.toLowerCase().includes(q) || entry.popsExplanation.toLowerCase().includes(q)
    );
  }, [query]);

  const analysis = useMemo(() => analyzeNarrative(narrative), [narrative]);

  return (
    <div>
      <div className="page-header">
        <h2>POPS Lexicon + Annotation Engine</h2>
        <p>POPS does not start with a legal form. It starts by teaching how to preserve facts.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpenCheck size={18} /> POPS Lexicon
          </h3>
        </div>

        <div className="search-bar" style={{ marginBottom: 12 }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search term definitions..."
          />
        </div>

        <div className="lexicon-list">
          {lexicon.map((entry) => (
            <div key={entry.term} className="lexicon-item">
              <div className="lexicon-term" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {entry.term}
                {entry.highSensitivity && (
                  <span className="annotation-chip">High-Sensitivity</span>
                )}
              </div>
              <div className="lexicon-explanation">{entry.popsExplanation}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Highlighter size={18} /> Highlights and Annotations
          </h3>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Narrative Draft</label>
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="Write incident narrative here..."
            style={{ minHeight: 90 }}
          />
        </div>

        <div className="annotation-chip-wrap">
          {analysis.findings.map((item, idx) => (
            <span key={`${item.term}-${idx}`} className="annotation-chip">
              {item.label}: {item.term}
            </span>
          ))}
        </div>

        {analysis.findings.some((f) => f.label === 'Attorney review') && (
          <div className="card" style={{ marginTop: 10, padding: 12, borderLeft: '3px solid var(--trust-red)' }}>
            <strong>Attorney Review Recommended:</strong> This term may carry legal significance. Make sure surrounding facts,
            evidence, and wording are accurate before filing or sharing.
          </div>
        )}

        <div className="report-preview" style={{ marginTop: 10, whiteSpace: 'normal' }}>
          <strong>Guidance:</strong>
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            {analysis.findings.map((item, idx) => (
              <li key={`detail-${idx}`}>{item.detail}</li>
            ))}
          </ul>
          <p style={{ marginTop: 10 }}><strong>{analysis.suggestedRewrite}</strong></p>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="nav-section-title" style={{ paddingLeft: 0 }}>Annotation Labels</div>
          <div className="annotation-chip-wrap">
            {ANNOTATION_LABELS.map((label) => (
              <span key={label} className="annotation-chip annotation-chip-soft">{label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
