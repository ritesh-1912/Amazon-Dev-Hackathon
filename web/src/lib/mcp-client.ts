// MCP Client that communicates with the Campus Ops MCP server over Streamable HTTP

const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL || 'http://localhost:3001';

interface McpToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

let sessionId: string | null = null;

async function mcpRequest(method: string, params: Record<string, unknown> = {}, id?: number): Promise<any> {
  const requestId = id ?? Math.floor(Math.random() * 100000);
  const isNotification = !id && method.startsWith('notifications/');

  const body: any = {
    jsonrpc: '2.0',
    method,
    params,
  };

  if (!isNotification) {
    body.id = requestId;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const res = await fetch(`${MCP_SERVER_URL}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  // Capture session ID from response
  const newSessionId = res.headers.get('mcp-session-id');
  if (newSessionId) {
    sessionId = newSessionId;
  }

  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    // Parse SSE response
    const text = await res.text();
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (data.id === requestId || data.result || data.error) {
          return data;
        }
      }
    }
    return null;
  }

  if (isNotification) {
    return null;
  }

  return res.json();
}

async function ensureInitialized(): Promise<void> {
  if (sessionId) return;

  const initResponse = await mcpRequest('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'campus-ops-web-simulator', version: '1.0.0' },
  }, 1);

  if (initResponse?.result) {
    await mcpRequest('notifications/initialized', {});
  }
}

export async function callTool(toolName: string, args: Record<string, unknown> = {}): Promise<McpToolCallResult> {
  await ensureInitialized();

  const response = await mcpRequest('tools/call', {
    name: toolName,
    arguments: args,
  });

  if (response?.result) {
    return response.result as McpToolCallResult;
  }

  if (response?.error) {
    return {
      isError: true,
      content: [{ type: 'text', text: response.error.message || 'Unknown MCP error' }],
    };
  }

  return {
    isError: true,
    content: [{ type: 'text', text: 'No response from MCP server' }],
  };
}

export function resetSession(): void {
  sessionId = null;
}
