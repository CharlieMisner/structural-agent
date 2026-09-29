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

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  prompt: string;
  history?: ChatMessage[];
}

export interface ChatResponse {
  response: string;
  tool_calls: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
}

export interface StreamEvent {
  type: 'token' | 'tool_start' | 'tool_end' | 'done' | 'error';
  content?: string;
  tool?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onToolStart?: (toolName: string, input?: Record<string, unknown>) => void;
  onToolEnd?: (toolName: string, output?: unknown) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
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

/**
 * Sends a single synchronous chat request to the agent (POST /api/chat).
 */
export async function sendChat(request: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${AGENT_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Agent request failed (${res.status}): ${errText}`);
  }

  return (await res.json()) as ChatResponse;
}

/**
 * Streams chat responses and tool execution events via Server-Sent Events (POST /api/chat/stream).
 */
export async function streamChat(
  request: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${AGENT_BASE_URL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    const error = new Error(`Streaming failed (${res.status}): ${errText}`);
    callbacks.onError?.(error);
    throw error;
  }

  if (!res.body) {
    throw new Error('Response body is null (streaming not supported)');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr) as StreamEvent;

            switch (event.type) {
              case 'token':
                if (event.content) {
                  callbacks.onToken(event.content);
                }
                break;

              case 'tool_start':
                if (event.tool) {
                  callbacks.onToolStart?.(event.tool, event.input);
                }
                break;

              case 'tool_end':
                if (event.tool) {
                  callbacks.onToolEnd?.(event.tool, event.output);
                }
                break;

              case 'done':
                callbacks.onDone?.();
                break;

              case 'error':
                callbacks.onError?.(new Error(event.error || 'Agent stream error'));
                break;
            }
          } catch {
            callbacks.onToken(jsonStr);
          }
        }
      }
    }

    callbacks.onDone?.();
  } catch (err) {
    if (signal?.aborted) return;
    callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}
