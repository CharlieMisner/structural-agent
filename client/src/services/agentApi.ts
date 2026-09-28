/**
 * Client API Service for communicating with the Statikor Python Agent Sidecar.
 * Connects to the local FastAPI daemon on 127.0.0.1:41420.
 */

export const AGENT_BASE_URL = 'http://127.0.0.1:41420';

export interface AgentHealthResponse {
  status: string;
  service: string;
  model: string;
  api_key_configured: boolean;
  available_tools: string[];
}

/**
 * Checks whether the Python FastAPI sidecar is up and responding.
 */
export async function checkAgentHealth(): Promise<AgentHealthResponse | null> {
  try {
    const res = await fetch(`${AGENT_BASE_URL}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as AgentHealthResponse;
  } catch {
    return null;
  }
}
