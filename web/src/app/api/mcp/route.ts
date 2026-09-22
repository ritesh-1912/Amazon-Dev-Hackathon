import { NextRequest, NextResponse } from 'next/server';
const rawServerUrl =
  process.env.MCP_SERVER_URL ||
  process.env.MCP_URL ||
  process.env.NEXT_PUBLIC_MCP_SERVER_URL ||
  'http://localhost:3001';
const MCP_SERVER_URL = rawServerUrl.replace(/\/+$/, '');

// Vercel Serverless Function execution timeout (up to 60s on Hobby plan)
export const maxDuration = 60;

// Server-side session management for MCP
let mcpSessionId: string | null = null;

async function mcpRequest(
  method: string,
  params: Record<string, unknown> = {},
  id?: number,
  timeoutMs: number = 45000
): Promise<any> {
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

  if (mcpSessionId) {
    headers['mcp-session-id'] = mcpSessionId;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${MCP_SERVER_URL}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
    }

    const newSessionId = res.headers.get('mcp-session-id');
    if (newSessionId) {
      mcpSessionId = newSessionId;
    }

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.id === requestId || data.result || data.error) {
              return data;
            }
          } catch {
            // skip non-JSON lines
          }
        }
      }
      return null;
    }

    if (isNotification) {
      return null;
    }

    return await res.json();
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s while waiting for MCP server (Render cold start)`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureInitialized(): Promise<void> {
  if (mcpSessionId) return;

  const initResponse = await mcpRequest(
    'initialize',
    {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'campus-ops-web-simulator', version: '1.0.0' },
    },
    1,
    45000 // at least 40s to tolerate Render cold start
  );

  if (initResponse?.result) {
    await mcpRequest('notifications/initialized', {}, undefined, 10000);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { tool, args } = await request.json();

    if (!tool || typeof tool !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid "tool" field' }, { status: 400 });
    }

    await ensureInitialized();

    const response = await mcpRequest('tools/call', {
      name: tool,
      arguments: args || {},
    }, undefined, 45000);

    if (response?.result) {
      return NextResponse.json({ result: response.result });
    }

    if (response?.error) {
      return NextResponse.json({ result: { isError: true, content: [{ type: 'text', text: response.error.message }] } });
    }

    return NextResponse.json({ result: { isError: true, content: [{ type: 'text', text: 'No response from MCP server' }] } });
  } catch (err: any) {
    console.error(`[MCP Connection Error] Failed to reach MCP server at ${MCP_SERVER_URL}:`, err);
    // Reset session on connection failure so next call re-initializes
    mcpSessionId = null;
    return NextResponse.json(
      { error: `MCP Server unreachable: ${err.message}. Make sure the server is running on ${MCP_SERVER_URL}` },
      { status: 502 }
    );
  }
}
