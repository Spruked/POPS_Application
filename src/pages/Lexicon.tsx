import { useMemo, useState } from 'react';
import { BookOpenCheck, Highlighter, Search } from 'lucide-react';
import {
  ANNOTATION_LABELS,
  LEXICON_FLAG_MESSAGE,
  LEXICON_REWRITE_STRATEGY,
  LEXICON_UI_BEHAVIOR,
  POPS_LEXICON,
  POPS_LEXICON_VALIDATION,
} from '../data/lexicon';
import { LEXICON_VALIDATION_FAILURE_MESSAGE } from '../data/validatePopsLexicon';
import { analyzeNarrative } from '../utils/annotationEngine';

function formatCategory(category: string) {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function Lexicon() {
  const [query, setQuery] = useState('');
  const [narrative, setNarrative] = useState('She kidnapped my daughter and lied to everyone.');

  const lexicon = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return POPS_LEXICON;
    return POPS_LEXICON.filter(
      (entry) =>
        entry.term.toLowerCase().includes(q) ||
        entry.category.toLowerCase().includes(q) ||
        entry.plainEnglish.toLowerCase().includes(q) ||
        entry.whyItMatters.toLowerCase().includes(q) ||
        entry.appGuidance.toLowerCase().includes(q)
    );
  }, [query]);

  const groupedLexicon = useMemo(() => {
    return lexicon.reduce<Record<string, typeof POPS_LEXICON>>((groups, entry) => {
      groups[entry.category] = groups[entry.category] || [];
      groups[entry.category].push(entry);
      return groups;
    }, {});
  }, [lexicon]);

  const analysis = useMemo(() => analyzeNarrative(narrative), [narrative]);

  return (
    <div>
      <div className="page-header">
        <h2>POPS Lexicon + Annotation Engine</h2>
        <p>POPS does not start with a legal form. It starts by teaching how to preserve facts.</p>
      </div>

      {!POPS_LEXICON_VALIDATION.ok && (
        <div className="card" style={{ borderLeft: '3px solid var(--trust-red)' }}>
          <strong>{LEXICON_VALIDATION_FAILURE_MESSAGE}</strong>
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            {POPS_LEXICON_VALIDATION.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpenCheck size={18} /> POPS Lexicon
          </h3>
        </div>

        {LEXICON_UI_BEHAVIOR.allow_search && (
          <div className="search-bar" style={{ marginBottom: 12 }}>
            <Search size={16} color="var(--text-muted)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search term definitions..."
            />
          </div>
        )}

        <div className="lexicon-list">
          {Object.entries(groupedLexicon).map(([category, entries]) => (
            <section className="lexicon-category-group" key={category}>
              <div className="nav-section-title" style={{ paddingLeft: 0 }}>
                {formatCategory(category)}
              </div>
              {entries.map((entry) => (
                <div key={entry.term} className="lexicon-item">
                  <div className="lexicon-term" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {entry.term}
                    {LEXICON_UI_BEHAVIOR.show_sensitivity_badge && (
                      <span className="annotation-chip">{entry.sensitivity.toUpperCase()}</span>
                    )}
                    {LEXICON_UI_BEHAVIOR.show_attorney_review_flag && entry.highSensitivity && (
                      <span className="annotation-chip annotation-chip-soft">Attorney Review</span>
                    )}
                  </div>
                  {LEXICON_UI_BEHAVIOR.show_plain_english && (
                    <div className="lexicon-explanation"><strong>Plain English:</strong> {entry.plainEnglish}</div>
                  )}
                  <div className="lexicon-explanation"><strong>Why it matters:</strong> {entry.whyItMatters}</div>
                  {LEXICON_UI_BEHAVIOR.show_court_safe_example && (
                    <div className="lexicon-explanation"><strong>Court-safe example:</strong> {entry.courtSafeExample}</div>
                  )}
                  <div className="lexicon-explanation"><strong>App guidance:</strong> {entry.appGuidance}</div>
                </div>
              ))}
            </section>
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
            <strong>Attorney Review Recommended:</strong> {LEXICON_FLAG_MESSAGE.replace('Attorney Review Recommended: ', '')}
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
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            {LEXICON_REWRITE_STRATEGY.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
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
