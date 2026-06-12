import popsLexiconSchema from './popslexicon.schema.json';

export const LEXICON_VALIDATION_FAILURE_MESSAGE =
  'POPS Lexicon validation failed. Lexicon guidance disabled until repaired.';

export interface PopsLexiconTerm {
  term: string;
  category: string;
  sensitivity: 'low' | 'medium' | 'high';
  plain_english: string;
  why_it_matters: string;
  court_safe_example: string;
  app_guidance: string;
}

export interface PopsLexiconData {
  module: 'POPS Lexicon';
  version: string;
  description: string;
  audience: string[];
  terms: PopsLexiconTerm[];
  global_rules: {
    high_sensitivity_terms: string[];
    flag_message: string;
    rewrite_strategy: string[];
  };
  ui_behavior: {
    show_plain_english: boolean;
    show_court_safe_example: boolean;
    show_sensitivity_badge: boolean;
    show_attorney_review_flag: boolean;
    allow_search: boolean;
    allow_favorites: boolean;
    allow_term_tagging: boolean;
  };
}

export interface PopsLexiconValidation {
  ok: boolean;
  errors: string[];
}

const schema = popsLexiconSchema as {
  required: string[];
  properties: Record<string, unknown>;
  $defs: {
    lexiconTerm: {
      required: string[];
      properties: {
        category: { enum: string[] };
        sensitivity: { enum: string[] };
      };
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function findUnexpectedKeys(value: Record<string, unknown>, allowed: string[]) {
  const allowedSet = new Set(allowed);
  return Object.keys(value).filter((key) => !allowedSet.has(key));
}

function hasUniqueStrings(values: string[]) {
  return new Set(values.map((value) => value.toLowerCase().trim())).size === values.length;
}

export function validatePopsLexicon(data: unknown): PopsLexiconValidation {
  const errors: string[] = [];

  if (!isRecord(data)) {
    return { ok: false, errors: ['Lexicon root must be an object.'] };
  }

  const rootAllowed = Object.keys(schema.properties);
  for (const key of schema.required) {
    if (!(key in data)) errors.push(`Missing required root field: ${key}`);
  }
  for (const key of findUnexpectedKeys(data, rootAllowed)) {
    errors.push(`Unexpected root field: ${key}`);
  }

  if (data.module !== 'POPS Lexicon') errors.push('module must equal POPS Lexicon.');
  if (!isNonEmptyString(data.version) || !/^\d+\.\d+\.\d+$/.test(data.version)) {
    errors.push('version must use semantic version format, for example 1.0.0.');
  }
  if (!isNonEmptyString(data.description)) errors.push('description is required.');

  if (!Array.isArray(data.audience) || data.audience.length === 0) {
    errors.push('audience must be a non-empty array.');
  } else {
    const audience = data.audience.filter(isNonEmptyString);
    if (audience.length !== data.audience.length || !hasUniqueStrings(audience)) {
      errors.push('audience must contain unique non-empty strings.');
    }
  }

  const allowedCategories = schema.$defs.lexiconTerm.properties.category.enum;
  const allowedSensitivity = schema.$defs.lexiconTerm.properties.sensitivity.enum;
  const termRequired = schema.$defs.lexiconTerm.required;
  const termAllowed = Object.keys(schema.$defs.lexiconTerm.properties);
  const termMap = new Map<string, PopsLexiconTerm>();

  if (!Array.isArray(data.terms) || data.terms.length === 0) {
    errors.push('terms must be a non-empty array.');
  } else {
    for (const [index, value] of data.terms.entries()) {
      if (!isRecord(value)) {
        errors.push(`terms[${index}] must be an object.`);
        continue;
      }

      for (const key of termRequired) {
        if (!(key in value)) errors.push(`terms[${index}] missing required field: ${key}`);
      }
      for (const key of findUnexpectedKeys(value, termAllowed)) {
        errors.push(`terms[${index}] unexpected field: ${key}`);
      }

      const term = value.term;
      if (!isNonEmptyString(term)) {
        errors.push(`terms[${index}].term must be a non-empty string.`);
      } else {
        const key = term.toLowerCase().trim();
        if (termMap.has(key)) errors.push(`Duplicate POPS lexicon term: ${term}`);
        termMap.set(key, value as unknown as PopsLexiconTerm);
      }

      if (!isNonEmptyString(value.category) || !allowedCategories.includes(value.category)) {
        errors.push(`terms[${index}].category is not supported.`);
      }
      if (!isNonEmptyString(value.sensitivity) || !allowedSensitivity.includes(value.sensitivity)) {
        errors.push(`terms[${index}].sensitivity is not supported.`);
      }
      for (const field of ['plain_english', 'why_it_matters', 'court_safe_example', 'app_guidance']) {
        if (!isNonEmptyString(value[field])) errors.push(`terms[${index}].${field} must be a non-empty string.`);
      }
    }
  }

  if (!isRecord(data.global_rules)) {
    errors.push('global_rules must be an object.');
  } else {
    const highSensitivityTerms = data.global_rules.high_sensitivity_terms;
    if (!Array.isArray(highSensitivityTerms) || highSensitivityTerms.length === 0) {
      errors.push('global_rules.high_sensitivity_terms must be a non-empty array.');
    } else {
      const terms = highSensitivityTerms.filter(isNonEmptyString);
      if (terms.length !== highSensitivityTerms.length || !hasUniqueStrings(terms)) {
        errors.push('global_rules.high_sensitivity_terms must contain unique non-empty strings.');
      }
      for (const term of terms) {
        const entry = termMap.get(term.toLowerCase().trim());
        if (!entry) {
          errors.push(`High-sensitivity term does not exist in terms: ${term}`);
        } else if (entry.sensitivity !== 'high') {
          errors.push(`High-sensitivity term must have sensitivity high: ${term}`);
        }
      }
    }
    if (!isNonEmptyString(data.global_rules.flag_message)) errors.push('global_rules.flag_message is required.');
    if (
      !Array.isArray(data.global_rules.rewrite_strategy) ||
      data.global_rules.rewrite_strategy.length === 0 ||
      data.global_rules.rewrite_strategy.filter(isNonEmptyString).length !== data.global_rules.rewrite_strategy.length
    ) {
      errors.push('global_rules.rewrite_strategy must contain non-empty strings.');
    }
  }

  if (!isRecord(data.ui_behavior)) {
    errors.push('ui_behavior must be an object.');
  } else {
    const requiredUiKeys = Object.keys((schema.properties.ui_behavior as { properties: Record<string, unknown> }).properties);
    for (const key of requiredUiKeys) {
      if (!(key in data.ui_behavior)) errors.push(`ui_behavior.${key} is required.`);
    }
    for (const key of findUnexpectedKeys(data.ui_behavior, requiredUiKeys)) {
      errors.push(`ui_behavior.${key} is not supported.`);
    }
    for (const key of Object.keys(data.ui_behavior)) {
      if (typeof data.ui_behavior[key] !== 'boolean') errors.push(`ui_behavior.${key} must be boolean.`);
    }
  }

  return { ok: errors.length === 0, errors };
}
