export const SMART_DOCUMENT_ACTIONS = [
  'create',
  'override',
  'acknowledge',
  'dispute',
  'supersede',
  'archive',
  'link_evidence',
  'verify',
  'export',
  'note',
] as const;

export type SmartDocumentAction = (typeof SMART_DOCUMENT_ACTIONS)[number];

export type SmartDocumentKind =
  | 'case_calendar_item'
  | 'timeline_event'
  | 'evidence_item'
  | 'communication_thread'
  | 'court_order'
  | 'incident'
  | 'report'
  | 'case_note'
  | 'shared_parenting_record'
  | 'other';

export type SmartDocumentStatus = 'active' | 'archived' | 'superseded' | 'needs_review';

export interface SmartDocumentPayload {
  /** Fields which become part of the current rendered state when this event is effective. */
  patch?: Record<string, unknown>;
  /** Stable record IDs; these reference evidence or related case records rather than copying them. */
  sourceRefs?: string[];
  attachmentRefs?: string[];
  summary?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface SmartDocumentEventDraft {
  documentId: string;
  documentKind: SmartDocumentKind;
  action: SmartDocumentAction;
  actorId: string;
  actorLabel: string;
  createdAt: string;
  effective: boolean;
  payload: SmartDocumentPayload;
  parentEventId?: string;
  source: 'user' | 'import' | 'system' | 'assistant_draft' | 'mesh';
}

export interface SmartDocumentEvent extends SmartDocumentEventDraft {
  eventId: string;
  sequence: number;
  payloadHash: string;
  previousEventHash?: string;
  eventHash: string;
}

export interface SmartDocumentSnapshot {
  documentId: string;
  documentKind: SmartDocumentKind;
  title: string;
  status: SmartDocumentStatus;
  currentState: Record<string, unknown>;
  sourceRefs: string[];
  attachmentRefs: string[];
  headEventId?: string;
  headEventHash?: string;
  eventCount: number;
  updatedAt?: string;
  history: SmartDocumentEvent[];
}

export interface SmartDocumentReceipt {
  ok: boolean;
  documentId: string;
  eventId: string;
  action: SmartDocumentAction;
  createdAt: string;
  eventHash: string;
  previousEventHash?: string;
  message: string;
}

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

function compareEvents(left: SmartDocumentEvent, right: SmartDocumentEvent) {
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  return left.createdAt.localeCompare(right.createdAt);
}

function nextStatus(event: SmartDocumentEvent, current: SmartDocumentStatus): SmartDocumentStatus {
  if (!event.effective) return current;
  if (event.action === 'archive') return 'archived';
  if (event.action === 'supersede') return 'superseded';
  if (event.action === 'dispute') return 'needs_review';
  if (event.action === 'verify' && current === 'needs_review') return 'active';
  return current;
}

/**
 * Rebuilds the readable current document from an append-only event history.
 * This reducer never erases prior history; consumers retain `history` for the audit view.
 */
export function materializeSmartDocument(events: SmartDocumentEvent[]): SmartDocumentSnapshot | null {
  if (!events.length) return null;

  const history = [...events].sort(compareEvents);
  const first = history[0];
  const currentState: Record<string, unknown> = {};
  let title = 'Untitled Smart Document';
  let status: SmartDocumentStatus = 'active';
  const sourceRefs: string[] = [];
  const attachmentRefs: string[] = [];

  for (const event of history) {
    status = nextStatus(event, status);

    if (!event.effective) continue;

    if (event.payload.patch) {
      Object.assign(currentState, event.payload.patch);
      const patchedTitle = event.payload.patch.title;
      if (typeof patchedTitle === 'string' && patchedTitle.trim()) title = patchedTitle.trim();
    }

    sourceRefs.push(...(event.payload.sourceRefs ?? []));
    attachmentRefs.push(...(event.payload.attachmentRefs ?? []));

    if (event.payload.summary && event.action === 'create' && title === 'Untitled Smart Document') {
      title = event.payload.summary;
    }
  }

  const head = history[history.length - 1];
  return {
    documentId: first.documentId,
    documentKind: first.documentKind,
    title,
    status,
    currentState,
    sourceRefs: unique(sourceRefs),
    attachmentRefs: unique(attachmentRefs),
    headEventId: head.eventId,
    headEventHash: head.eventHash,
    eventCount: history.length,
    updatedAt: head.createdAt,
    history,
  };
}

export function createSmartDocumentDraft(input: Omit<SmartDocumentEventDraft, 'action' | 'createdAt' | 'effective'> & {
  createdAt?: string;
  effective?: boolean;
}): SmartDocumentEventDraft {
  return {
    ...input,
    action: 'create',
    createdAt: input.createdAt ?? new Date().toISOString(),
    effective: input.effective ?? true,
  };
}

export function isSmartDocumentAction(value: string): value is SmartDocumentAction {
  return (SMART_DOCUMENT_ACTIONS as readonly string[]).includes(value);
}

export function summarizeSmartDocumentEvent(event: SmartDocumentEventDraft): string {
  const summary = event.payload.summary?.trim();
  if (summary) return summary;
  const patchKeys = Object.keys(event.payload.patch ?? {});
  if (patchKeys.length) return `${event.action} updated ${patchKeys.join(', ')}`;
  return `${event.action} event recorded`;
}
