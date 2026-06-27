import { invoke } from "@tauri-apps/api/tauri";
import { generateId } from "../utils/helpers";

export type MorbResearchRequest = {
  topic: string;
  personContext: string;
};

export type McpResearchResult = {
  tool: string;
  query: string;
  context: string;
  status: string;
  title: string;
  finding: string;
  sources: string[];
  deterministic: boolean;
  adapter: string;
  created_at: string;
};

export type MorbResearchResult = {
  morb: string;
  status: "complete";
  topic: string;
  personContext: string;
  finding: string;
  mcpResult: McpResearchResult;
  doctrine: {
    localFirst: boolean;
    userDirected: boolean;
    noExternalProviderCall: boolean;
  };
  safety: {
    privateCaseMaterialSentExternally: boolean;
    legalConclusionGenerated: boolean;
  };
  receipt: {
    id: string;
    createdAt: string;
    mcpTool: string;
  };
};

export async function runResearchMorb(request: MorbResearchRequest): Promise<MorbResearchResult> {
  const topic = request.topic.trim();
  const personContext = request.personContext.trim();

  if (!topic) {
    throw new Error("Research topic is required.");
  }

  const mcpResult = await invoke<McpResearchResult>("mcp_research_tool", {
    input: {
      query: topic,
      context: personContext,
      adapter: "placeholder",
    },
  });

  return {
    morb: "morb.research.v1",
    status: "complete",
    topic,
    personContext,
    finding: mcpResult.finding,
    mcpResult,
    doctrine: {
      localFirst: true,
      userDirected: true,
      noExternalProviderCall: true,
    },
    safety: {
      privateCaseMaterialSentExternally: false,
      legalConclusionGenerated: false,
    },
    receipt: {
      id: generateId(),
      createdAt: new Date().toISOString(),
      mcpTool: mcpResult.tool,
    },
  };
}
