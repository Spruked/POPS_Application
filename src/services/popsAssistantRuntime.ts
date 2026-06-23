import { formatCaseCommandResponse, routeAssistantPrompt } from './popsAssistantRouting';
import { reasonThroughTpc } from './tpcClient';

export interface AssistantRuntimeResult {
  mode: 'case-command' | 'tpc';
  text: string;
  statusLine: string;
}

export async function runPopsAssistant(prompt: string): Promise<AssistantRuntimeResult> {
  const route = await routeAssistantPrompt(prompt);

  if (route.route === 'case-command' && route.caseCommand) {
    return {
      mode: 'case-command',
      text: formatCaseCommandResponse(route.caseCommand),
      statusLine: route.caseCommand.ok ? 'Case Command MCP verified local records' : 'Case Command MCP needs attention',
    };
  }

  const tpc = await reasonThroughTpc(route.normalizedPrompt);
  return {
    mode: 'tpc',
    text: tpc.output || 'TPC did not return a response.',
    statusLine: `TPC ${tpc.status}${typeof tpc.confidence === 'number' ? ` · confidence ${Math.round(tpc.confidence * 100)}%` : ''}`,
  };
}
