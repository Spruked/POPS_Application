import { HIGH_SENSITIVITY_TERMS, RISK_TERMS, type AnnotationLabel } from '../data/lexicon';

export interface AnnotationFinding {
  term: string;
  label: AnnotationLabel;
  detail: string;
}

export interface AnnotationResult {
  findings: AnnotationFinding[];
  suggestedRewrite: string;
}

function hasDate(text: string): boolean {
  return /\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b/.test(text);
}

function hasEvidenceReference(text: string): boolean {
  return /\bevidence|screenshot|photo|message|record|receipt|pdf|order\b/i.test(text);
}

export function analyzeNarrative(text: string): AnnotationResult {
  const normalized = text.toLowerCase();
  const findings: AnnotationFinding[] = [];

  Object.entries(RISK_TERMS).forEach(([term, detail]) => {
    if (normalized.includes(term)) {
      findings.push({
        term,
        label: 'Risk word',
        detail,
      });
    }
  });

  HIGH_SENSITIVITY_TERMS.forEach((term) => {
    if (normalized.includes(term)) {
      findings.push({
        term,
        label: 'Attorney review',
        detail:
          'Attorney Review Recommended: This term may carry legal significance. Confirm surrounding facts, evidence, and wording before filing or sharing.',
      });
    }
  });

  if (!hasDate(text)) {
    findings.push({
      term: 'date/time',
      label: 'Date needed',
      detail: 'Add date and time for the event so timeline review is possible.',
    });
  }

  if (!hasEvidenceReference(text)) {
    findings.push({
      term: 'evidence link',
      label: 'Needs evidence',
      detail: 'Link this statement to message, screenshot, file, or record evidence.',
    });
  }

  if (!/\border\b/i.test(text)) {
    findings.push({
      term: 'order reference',
      label: 'Order link needed',
      detail: 'Reference the related court order term/date where applicable.',
    });
  }

  const suggestedRewrite =
    'Court-safe rewrite: The child was not made available for scheduled parenting time. I attempted contact and preserved related communication records and timeline details.';

  return { findings, suggestedRewrite };
}
