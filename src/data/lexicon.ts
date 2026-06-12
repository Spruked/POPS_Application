export interface LexiconEntry {
  term: string;
  popsExplanation: string;
  category: 'custody' | 'evidence' | 'support' | 'language';
  highSensitivity?: boolean;
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

export const POPS_LEXICON: LexiconEntry[] = [
  {
    term: 'Denied parenting time',
    popsExplanation:
      'A scheduled visit or exchange did not happen because the child was not made available or access was blocked.',
    category: 'custody',
  },
  {
    term: 'Contempt',
    popsExplanation:
      'A possible legal issue where someone may have failed to follow a court order. POPS should explain facts, not accuse.',
    category: 'language',
  },
  {
    term: 'Arrears',
    popsExplanation: 'Past-due child support balance.',
    category: 'support',
  },
  {
    term: 'Good-faith attempt',
    popsExplanation:
      'A documented effort to comply, appear, communicate, or resolve an issue lawfully.',
    category: 'custody',
  },
  {
    term: 'Chain of custody',
    popsExplanation:
      'The record of how evidence was received, stored, handled, and preserved.',
    category: 'evidence',
  },
  {
    term: 'Native file',
    popsExplanation:
      'The original file in its original format before edits or conversion.',
    category: 'evidence',
  },
  {
    term: 'Metadata',
    popsExplanation:
      'Information attached to a file, such as date, source, device, or creation details.',
    category: 'evidence',
  },
  {
    term: 'Court-safe language',
    popsExplanation:
      'Factual, non-inflammatory wording suitable for attorney or court review.',
    category: 'language',
  },
  {
    term: 'Parenting plan',
    popsExplanation:
      'A written schedule and rule structure for parenting time, decision-making, communication, and child-related duties.',
    category: 'custody',
  },
  {
    term: 'Support obligation',
    popsExplanation:
      'The current amount owed under an order or agreement.',
    category: 'support',
  },
  {
    term: 'Culpable',
    popsExplanation:
      'Legally or morally responsible for an act, failure, violation, or wrongdoing. Use carefully and anchor to documented facts.',
    category: 'language',
    highSensitivity: true,
  },
  {
    term: 'Exculpatory',
    popsExplanation:
      'Evidence that may help show a person did not do something wrong, complied with an order, or made good-faith lawful efforts.',
    category: 'evidence',
  },
  {
    term: 'Pro se',
    popsExplanation:
      'Representing yourself in court without an attorney. POPS helps organize records but does not replace legal counsel.',
    category: 'language',
  },
  {
    term: 'Prima facie',
    popsExplanation:
      'A preliminary showing that appears sufficient on its face unless challenged by other evidence.',
    category: 'language',
    highSensitivity: true,
  },
  {
    term: 'Estoppel',
    popsExplanation:
      'A legal principle that may prevent a contradictory position when earlier words/actions were reasonably relied on.',
    category: 'language',
    highSensitivity: true,
  },
  {
    term: 'Habeas corpus',
    popsExplanation:
      'A serious legal procedure used to challenge unlawful detention or restraint. Requires attorney-level review before use.',
    category: 'language',
    highSensitivity: true,
  },
  {
    term: 'Fifth Amendment',
    popsExplanation:
      'U.S. constitutional protections including due process and the right against self-incrimination; sensitive statements should be reviewed by counsel.',
    category: 'language',
    highSensitivity: true,
  },
  {
    term: 'Fourteenth Amendment',
    popsExplanation:
      'U.S. constitutional due process and equal protection principles often discussed in relation to parental rights, notice, and fairness.',
    category: 'language',
    highSensitivity: true,
  },
  {
    term: 'Due process',
    popsExplanation:
      'Fair legal procedure, including notice and meaningful opportunity to be heard before important rights are affected.',
    category: 'language',
  },
  {
    term: 'Equal protection',
    popsExplanation:
      'Government should apply law fairly and not treat similarly situated people differently without lawful reason.',
    category: 'language',
  },
];

export const RISK_TERMS: Record<string, string> = {
  kidnapped: 'Use factual wording: child was not made available for scheduled parenting time.',
  lied: 'Use factual wording: statement appears inconsistent with preserved records.',
  everyone: 'Use specific people or entities instead of broad claims.',
  stealing: 'Describe the missed exchange or denied schedule event with date and time.',
  ignored: 'Describe response outcome and attach communication evidence.',
  threatened: 'Describe exact words or behavior and attach source evidence.',
};

export const HIGH_SENSITIVITY_TERMS = [
  'culpable',
  'estoppel',
  'habeas corpus',
  'fifth amendment',
  'fourteenth amendment',
  'prima facie',
];

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
