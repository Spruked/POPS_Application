import { invoke } from '@tauri-apps/api/tauri';

export type CaseCommandAuthority = 'read' | 'draft' | 'write' | 'receipt';

export type CaseCommandTool =
  | 'pops.contacts.search'
  | 'pops.calls.list'
  | 'pops.documents.search'
  | 'pops.timeline.query'
  | 'pops.calendar.list_upcoming';

export interface CaseCommandRequest {
  tool: CaseCommandTool;
  authority: CaseCommandAuthority;
  args?: Record<string, unknown>;
}

export interface CaseCommandResult {
  ok: boolean;
  tool: CaseCommandTool;
  authority: CaseCommandAuthority;
  message: string;
  records: unknown[];
  createdAt: string;
}

const asText = (value: unknown) => String(value ?? '').toLowerCase();
const asRecord = (value: unknown) => (value && typeof value === 'object' ? value as Record<string, unknown> : {});

function find(records: unknown[], search: string, fields: string[]) {
  const needle = search.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((row) => {
    const record = asRecord(row);
    return fields.some((field) => asText(record[field]).includes(needle));
  });
}

async function localRead(command: string): Promise<unknown[]> {
  const data = await invoke<unknown>(command);
  return Array.isArray(data) ? data : [];
}

export async function runCaseCommand(request: CaseCommandRequest): Promise<CaseCommandResult> {
  const createdAt = new Date().toISOString();
  const search = String(request.args?.search ?? '');

  if (request.authority !== 'read') {
    return {
      ok: false,
      tool: request.tool,
      authority: request.authority,
      message: 'This initial Case Command adapter only exposes verified local read tools.',
      records: [],
      createdAt,
    };
  }

  try {
    if (request.tool === 'pops.contacts.search') {
      const records = await localRead('get_players_dossier');
      const matches = find(records, search, ['name', 'role', 'organization', 'phoneNumbers', 'emails', 'relationshipToCase']);
      return { ok: true, tool: request.tool, authority: 'read', message: `${matches.length} contact record(s) found.`, records: matches, createdAt };
    }

    if (request.tool === 'pops.calls.list') {
      const records = await localRead('get_communication_records');
      const matches = find(records, search, ['title', 'participants', 'courtSafeSummary', 'firstTimestamp', 'lastTimestamp']);
      return { ok: true, tool: request.tool, authority: 'read', message: `${matches.length} call or communication record(s) found.`, records: matches, createdAt };
    }

    if (request.tool === 'pops.documents.search') {
      const records = await localRead('get_evidence');
      const matches = find(records, search, ['title', 'description', 'tags', 'fileName', 'sourceDescription', 'date']);
      return { ok: true, tool: request.tool, authority: 'read', message: `${matches.length} document record(s) found.`, records: matches, createdAt };
    }

    const allEvents = await localRead('get_events');
    if (request.tool === 'pops.timeline.query') {
      const matches = find(allEvents, search, ['title', 'description', 'type', 'date']);
      return { ok: true, tool: request.tool, authority: 'read', message: `${matches.length} timeline record(s) found.`, records: matches, createdAt };
    }

    const today = String(request.args?.from ?? new Date().toISOString().slice(0, 10));
    const calendarTypes = ['calendar', 'court', 'deadline', 'appointment', 'medical', 'school', 'visit', 'parenting_time', 'reminder', 'follow_up'];
    const matches = allEvents
      .filter((row) => {
        const record = asRecord(row);
        return calendarTypes.includes(asText(record.type)) && String(record.date ?? '') >= today;
      })
      .sort((left, right) => String(asRecord(left).date ?? '').localeCompare(String(asRecord(right).date ?? '')));
    return { ok: true, tool: request.tool, authority: 'read', message: matches.length ? `${matches.length} upcoming Case Calendar item(s) found.` : 'No upcoming Case Calendar items are saved.', records: matches, createdAt };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown local command error';
    return { ok: false, tool: request.tool, authority: request.authority, message: `Case Command failed: ${detail}`, records: [], createdAt };
  }
}
