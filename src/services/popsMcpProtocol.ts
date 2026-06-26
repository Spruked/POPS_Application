import type {
  SmartDocumentEventDraft,
  SmartDocumentReceipt,
  SmartDocumentSnapshot,
} from '../domain/smartDocument';

/**
 * POPS Case Command protocol.
 *
 * This file defines the application contract used by the in-app ORB and the
 * future local MCP server. It intentionally does not grant raw SQLite access.
 * Every durable write must be executed by a validated Tauri command and return
 * a receipt before the interface reports success.
 */
export type PopsMcpAuthority = 'read' | 'draft' | 'confirm' | 'write' | 'receipt';

export type PopsMcpTool =
  | 'pops.case.search'
  | 'pops.contacts.search'
  | 'pops.calendar.list'
  | 'pops.calendar.propose'
  | 'pops.timeline.query'
  | 'pops.timeline.propose'
  | 'pops.evidence.search'
  | 'pops.evidence.import'
  | 'pops.evidence.verify'
  | 'pops.communications.list'
  | 'pops.orders.search'
  | 'pops.smart_document.get'
  | 'pops.smart_document.history'
  | 'pops.smart_document.append_draft'
  | 'pops.smart_document.confirm'
  | 'pops.reports.prepare'
  | 'pops.reports.export'
  | 'pops.mesh.status'
  | 'pops.mesh.sync_manifest';

export interface PopsMcpRequest<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  requestId: string;
  tool: PopsMcpTool;
  authority: PopsMcpAuthority;
  args: TArgs;
  requestedAt: string;
  sessionId?: string;
}

export interface PopsMcpSourceRef {
  recordType: 'calendar' | 'timeline' | 'evidence' | 'communication' | 'order' | 'incident' | 'contact' | 'smart_document' | 'report';
  recordId: string;
  label?: string;
  trustStatus?: 'verified' | 'needs_review' | 'source_limited' | 'unverified';
}

export interface PopsMcpResult<TData = unknown> {
  ok: boolean;
  requestId: string;
  tool: PopsMcpTool;
  authority: PopsMcpAuthority;
  status: 'completed' | 'draft' | 'awaiting_confirmation' | 'rejected' | 'failed';
  message: string;
  data?: TData;
  sourceRefs: PopsMcpSourceRef[];
  receipt?: SmartDocumentReceipt | PopsActionReceipt;
  completedAt: string;
}

export interface PopsActionReceipt {
  actionId: string;
  action: string;
  recordId?: string;
  savedAt: string;
  databaseAuthority: 'tauri_sqlite';
  auditEventId?: string;
  message: string;
}

export interface SmartDocumentAppendDraftArgs {
  draft: SmartDocumentEventDraft;
}

export interface SmartDocumentGetArgs {
  documentId: string;
}

export type SmartDocumentGetResult = SmartDocumentSnapshot;

export interface CalendarProposalArgs {
  documentId?: string;
  title: string;
  category:
    | 'parenting_time'
    | 'court_deadline'
    | 'appointment'
    | 'medical'
    | 'school'
    | 'attorney_meeting'
    | 'required_contact'
    | 'reminder'
    | 'follow_up'
    | 'activity';
  startsAt: string;
  endsAt?: string;
  location?: string;
  childIds?: string[];
  linkedOrderId?: string;
  linkedEvidenceIds?: string[];
  notes?: string;
}

export function newMcpRequest<TArgs extends Record<string, unknown>>(
  tool: PopsMcpTool,
  authority: PopsMcpAuthority,
  args: TArgs,
  sessionId?: string,
): PopsMcpRequest<TArgs> {
  return {
    requestId: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pops-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tool,
    authority,
    args,
    requestedAt: new Date().toISOString(),
    sessionId,
  };
}

export function isWriteTool(tool: PopsMcpTool): boolean {
  return [
    'pops.calendar.propose',
    'pops.timeline.propose',
    'pops.evidence.import',
    'pops.smart_document.append_draft',
    'pops.smart_document.confirm',
    'pops.reports.export',
    'pops.mesh.sync_manifest',
  ].includes(tool);
}

export function requiresReceipt(result: PopsMcpResult): boolean {
  return isWriteTool(result.tool) && result.status === 'completed';
}

export function hasVerifiedReceipt(result: PopsMcpResult): boolean {
  return !requiresReceipt(result) || Boolean(result.receipt);
}
