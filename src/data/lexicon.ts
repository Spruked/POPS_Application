import popsLexicon from './popslexicon.json';
import {
  LEXICON_VALIDATION_FAILURE_MESSAGE,
  validatePopsLexicon,
  type PopsLexiconData,
} from './validatePopsLexicon';

export interface LexiconEntry {
  term: string;
  category: string;
  sensitivity: 'high' | 'medium' | 'low';
  plainEnglish: string;
  whyItMatters: string;
  courtSafeExample: string;
  appGuidance: string;
  highSensitivity: boolean;
}

export type AnnotationLabel =
  | 'Court-safe'
  | 'Risk word'
  | 'Needs evidence'
  | 'Date needed'
  | 'Source needed'
  | 'Order link needed'
  | 'Child-related'
  | 'Support-related'
  | 'Attorney review';

export const POPS_LEXICON_VALIDATION = validatePopsLexicon(popsLexicon);

const validatedLexicon = POPS_LEXICON_VALIDATION.ok ? (popsLexicon as PopsLexiconData) : null;

export const POPS_LEXICON: LexiconEntry[] = validatedLexicon ? validatedLexicon.terms.map((entry) => ({
  term: entry.term,
  category: entry.category,
  sensitivity: entry.sensitivity,
  plainEnglish: entry.plain_english,
  whyItMatters: entry.why_it_matters,
  courtSafeExample: entry.court_safe_example,
  appGuidance: entry.app_guidance,
  highSensitivity: validatedLexicon.global_rules.high_sensitivity_terms
    .map((term) => term.toLowerCase())
    .includes(entry.term.toLowerCase()),
})) : [];

export const LEXICON_FLAG_MESSAGE = validatedLexicon
  ? validatedLexicon.global_rules.flag_message
  : LEXICON_VALIDATION_FAILURE_MESSAGE;

export const LEXICON_REWRITE_STRATEGY = validatedLexicon
  ? validatedLexicon.global_rules.rewrite_strategy
  : [];

export const LEXICON_UI_BEHAVIOR = validatedLexicon
  ? validatedLexicon.ui_behavior
  : {
      show_plain_english: false,
      show_court_safe_example: false,
      show_sensitivity_badge: false,
      show_attorney_review_flag: false,
      allow_search: false,
      allow_favorites: false,
      allow_term_tagging: false,
    };

export function buildOrbLexiconGuidance() {
  if (!validatedLexicon) return LEXICON_VALIDATION_FAILURE_MESSAGE;

  const rules = validatedLexicon.global_rules.rewrite_strategy.map((rule) => `- ${rule}`).join('\n');
  const highTerms = validatedLexicon.global_rules.high_sensitivity_terms.join(', ');
  const terms = validatedLexicon.terms
    .map(
      (entry) =>
        `- ${entry.term} (${entry.category}, ${entry.sensitivity}): ${entry.plain_english} Guidance: ${entry.app_guidance}`
    )
    .join('\n');

  return [
    `${validatedLexicon.module} v${validatedLexicon.version}`,
    validatedLexicon.description,
    `High-sensitivity terms: ${highTerms}`,
    `Flag message: ${validatedLexicon.global_rules.flag_message}`,
    'Rewrite strategy:',
    rules,
    'Terms:',
    terms,
  ].join('\n');
}

export const RISK_TERMS: Record<string, string> = {
  kidnapped: 'Use factual wording: child was not made available for scheduled parenting time.',
  lied: 'Use factual wording: statement appears inconsistent with preserved records.',
  everyone: 'Use specific people or entities instead of broad claims.',
  stealing: 'Describe the missed exchange or denied schedule event with date and time.',
  ignored: 'Describe response outcome and attach communication evidence.',
  threatened: 'Describe exact words or behavior and attach source evidence.',
};

export const HIGH_SENSITIVITY_TERMS = validatedLexicon
  ? validatedLexicon.global_rules.high_sensitivity_terms.map((term) => term.toLowerCase())
  : [];

export const ANNOTATION_LABELS: AnnotationLabel[] = [
  'Court-safe',
  'Risk word',
  'Needs evidence',
  'Date needed',
  'Source needed',
  'Order link needed',
  'Child-related',
  'Support-related',
  'Attorney review',
];
