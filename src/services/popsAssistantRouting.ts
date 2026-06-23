import { runCaseCommand, type CaseCommandResult } from './popsCaseCommandMcp';

export type AssistantRoute = 'case-command' | 'tpc-reasoning';

export interface AssistantRouteResult {
  route: AssistantRoute;
  caseCommand?: CaseCommandResult;
  normalizedPrompt: string;
}

export async function routeAssistantPrompt(prompt: string): Promise<AssistantRouteResult> {
  const normalized = prompt.trim().toLowerCase();
  const request = normalized.includes('calendar') && (normalized.includes('next') || normalized.includes('upcoming'))
    ? { tool: 'pops.calendar.list_upcoming' as const, authority: 'read' as const }
    : normalized.includes('contact')
      ? { tool: 'pops.contacts.search' as const, authority: 'read' as const, args: { search: '' } }
      : normalized.includes('call') || normalized.includes('communication')
        ? { tool: 'pops.calls.list' as const, authority: 'read' as const, args: { search: '' } }
        : normalized.includes('document') || normalized.includes('evidence')
          ? { tool: 'pops.documents.search' as const, authority: 'read' as const, args: { search: '' } }
          : normalized.includes('timeline') || normalized.includes('event')
            ? { tool: 'pops.timeline.query' as const, authority: 'read' as const, args: { search: '' } }
            : null;

  if (!request) return { route: 'tpc-reasoning', normalizedPrompt: prompt.trim() };
  return { route: 'case-command', normalizedPrompt: prompt.trim(), caseCommand: await runCaseCommand(request) };
}

export function formatCaseCommandResponse(result: CaseCommandResult) {
  if (!result.ok || !result.records.length) return result.message;
  const lines = result.records.slice(0, 12).map((row) => {
    const record = row as Record<string, unknown>;
    const title = String(record.title ?? record.name ?? 'Untitled record');
    const date = String(record.date ?? record.createdAt ?? '');
    return date ? `• ${date} — ${title}` : `• ${title}`;
  });
  return `${result.message}\n\n${lines.join('\n')}`;
}
