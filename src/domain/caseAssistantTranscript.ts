import type { PopsActionReceipt, PopsMcpSourceRef } from '../services/popsMcpProtocol';

export type CaseAssistantTranscriptStage =
  | 'user_request'
  | 'record_lookup'
  | 'draft_prepared'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'native_action'
  | 'receipt'
  | 'final_response'
  | 'error';

export interface CaseAssistantTranscriptEntry {
  id: string;
  sessionId: string;
  stage: CaseAssistantTranscriptStage;
  createdAt: string;
  text: string;
  sourceRefs: PopsMcpSourceRef[];
  draftId?: string;
  receipt?: PopsActionReceipt;
  metadata?: Record<string, unknown>;
}

export interface CaseAssistantTranscript {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  entries: CaseAssistantTranscriptEntry[];
}

/**
 * A court-safe activity history for the POPS Case Assistant.
 * This is not hidden LLM reasoning. It records user-visible requests, source
 * records consulted, drafts, confirmations, durable action receipts, and final
 * responses so the app can explain what it actually did.
 */
export function appendTranscriptEntry(
  transcript: CaseAssistantTranscript,
  entry: Omit<CaseAssistantTranscriptEntry, 'id' | 'sessionId' | 'createdAt'> & {
    id?: string;
    createdAt?: string;
  },
): CaseAssistantTranscript {
  const createdAt = entry.createdAt ?? new Date().toISOString();
  const id = entry.id ?? `${transcript.sessionId}:${createdAt}:${transcript.entries.length + 1}`;
  const nextEntry: CaseAssistantTranscriptEntry = {
    id,
    sessionId: transcript.sessionId,
    stage: entry.stage,
    createdAt,
    text: entry.text,
    sourceRefs: entry.sourceRefs,
    draftId: entry.draftId,
    receipt: entry.receipt,
    metadata: entry.metadata,
  };

  return {
    ...transcript,
    updatedAt: createdAt,
    entries: [...transcript.entries, nextEntry],
  };
}

export function newCaseAssistantTranscript(sessionId: string, createdAt = new Date().toISOString()): CaseAssistantTranscript {
  return { sessionId, createdAt, updatedAt: createdAt, entries: [] };
}

export function hasCompletedNativeAction(transcript: CaseAssistantTranscript): boolean {
  return transcript.entries.some((entry) => entry.stage === 'receipt' && Boolean(entry.receipt));
}

export function citedRecordCount(transcript: CaseAssistantTranscript): number {
  const keys = new Set<string>();
  transcript.entries.forEach((entry) => {
    entry.sourceRefs.forEach((source) => keys.add(`${source.recordType}:${source.recordId}`));
  });
  return keys.size;
}
