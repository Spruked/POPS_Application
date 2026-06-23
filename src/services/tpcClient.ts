export interface TpcReasoningResult {
  status: string;
  output: string;
  confidence?: number;
  coherence?: Record<string, unknown>;
  vaultRetrieval?: Record<string, unknown>;
  ecm?: Record<string, unknown>;
  drift?: Record<string, unknown>;
  depthTrace?: string[];
}

const TPC_BASE_URL = (import.meta.env.VITE_TPC_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export async function reasonThroughTpc(input: string, sessionId?: string): Promise<TpcReasoningResult> {
  const response = await fetch(`${TPC_BASE_URL}/api/v1/reason`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, input_type: 'text', session_id: sessionId }),
  });

  if (!response.ok) throw new Error(`TPC returned HTTP ${response.status}`);
  const data = await response.json();
  return {
    status: String(data?.status ?? 'error'),
    output: String(data?.output ?? ''),
    confidence: typeof data?.confidence === 'number' ? data.confidence : undefined,
    coherence: data?.coherence,
    vaultRetrieval: data?.vault_retrieval,
    ecm: data?.ecm,
    drift: data?.drift,
    depthTrace: Array.isArray(data?.depth_trace) ? data.depth_trace : [],
  };
}
