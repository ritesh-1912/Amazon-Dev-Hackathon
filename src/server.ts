import express, { Request, Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { registerTaskTools } from './tools.js';
import { getDb } from './db.js';

export function createCampusOpsMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'campus-ops-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
        logging: {},
      },
    }
  );

  registerTaskTools(server);
  return server;
}

export function createCampusOpsApp(): { app: express.Express; transports: Record<string, StreamableHTTPServerTransport> } {
  const app = express();
  app.use(cors({ origin: '*', exposedHeaders: ['mcp-session-id'] }));
  app.use(express.json());

  // Ensure DB is initialized
  getDb();

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Health and info endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'campus-ops-mcp',
      transport: 'streamable-http',
      specVersion: '2025-11-25',
      activeSessions: Object.keys(transports).length,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'Campus Ops MCP Server',
      description: 'Academic operations assistant with dependency tracking and human-guarded actions',
      mcpEndpoint: '/mcp',
      healthEndpoint: '/health',
      activeSessions: Object.keys(transports).length,
    });
  });

  // Streamable HTTP POST handler
  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports[sessionId]) {
        // Reuse session transport
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New session initialization
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            if (transport) {
              transports[sid] = transport;
            }
          },
        });

        transport.onclose = () => {
          const sid = transport?.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
          }
        };

        const server = createCampusOpsMcpServer();
        await server.connect(transport);
      } else if (!sessionId) {
        // Stateless single-request fallback or missing initialization
        // Create an ephemeral transport to handle the request gracefully
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });
        const server = createCampusOpsMcpServer();
        await server.connect(transport);
      } else {
        // Session ID was passed but was not found
        res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: `Session "${sessionId}" not found or expired`,
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      console.error('Error processing /mcp request:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: err?.message || 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Streamable HTTP GET handler (SSE stream for notifications/events)
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing mcp-session-id header');
      return;
    }

    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (err: any) {
      console.error('Error handling SSE stream:', err);
      if (!res.headersSent) {
        res.status(500).send('Failed to establish event stream');
      }
    }
  });

  // Streamable HTTP DELETE handler (explicit session teardown)
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing mcp-session-id header');
      return;
    }

    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
      await transport.close();
      delete transports[sessionId];
    } catch (err: any) {
      console.error('Error terminating session:', err);
      if (!res.headersSent) {
        res.status(500).send('Failed to terminate session');
      }
    }
  });

  return { app, transports };
}
