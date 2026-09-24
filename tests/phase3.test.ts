import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  getDb,
  closeDb,
  createTask,
  getWeeklyBriefData,
} from '../src/db.js';
import {
  generateSmartBrief,
  resetBedrockClient,
  getBedrockClient,
  detectBedrockAuthMethod,
  logBedrockStartup,
} from '../src/lib/bedrock.js';
import { createCampusOpsApp } from '../src/server.js';
import type { Server } from 'node:http';
import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test_phase3_campus_ops.db');

describe('Phase 3 — AWS Bedrock Integration & Fallback', () => {
  beforeEach(() => {
    process.env.DB_PATH = TEST_DB_PATH;
    closeDb();
    resetBedrockClient();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    getDb(TEST_DB_PATH);
  });

  afterEach(() => {
    closeDb();
    resetBedrockClient();
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch {}
    }
    vi.restoreAllMocks();
  });

  it('generates a spoken smart brief when Bedrock returns a valid response', async () => {
    const briefData = {
      generated_at: new Date().toISOString(),
      tasks_due_soon: [
        {
          id: 't-1',
          title: 'Calculus Problem Set 3',
          category: 'assignment' as const,
          deadline: new Date(Date.now() + 86400000).toISOString(),
          depends_on: [],
          status: 'open' as const,
          action_class: 'AUTO' as const,
          audit_log: [],
        },
      ],
      blocked_tasks: [
        {
          task: {
            id: 't-2',
            title: 'Project Submission',
            category: 'project' as const,
            deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
            depends_on: ['t-1'],
            status: 'blocked' as const,
            action_class: 'HUMAN_REQUIRED' as const,
            audit_log: [],
          },
          blocked_by: [{ id: 't-1', title: 'Calculus Problem Set 3', status: 'open' as const }],
        },
      ],
      stale_tasks: [],
      pending_confirmations: [],
      summary: { total_open: 2, due_in_7_days: 1, blocked: 1, stale: 0, human_required: 1 },
    };

    const mockClaudeResponse =
      'Good morning. Calculus Problem Set 3 is due tomorrow. Your Project Submission remains blocked until the problem set is completed. No fee confirmations are pending today.';

    const mockClient = {
      send: vi.fn().mockResolvedValue({
        output: {
          message: {
            content: [{ text: mockClaudeResponse }],
          },
        },
      }),
    } as unknown as BedrockRuntimeClient;

    const result = await generateSmartBrief(briefData, mockClient);

    expect(result.source).toBe('aws_bedrock_claude');
    expect(result.brief).toBe(mockClaudeResponse);
    expect(result.structured_brief).toBeDefined();
    expect(mockClient.send).toHaveBeenCalledTimes(1);
  });

  it('gracefully falls back without crashing when Bedrock throws an error', async () => {
    const briefData = {
      generated_at: new Date().toISOString(),
      tasks_due_soon: [
        {
          id: 't-1',
          title: 'Physics Lab',
          category: 'assignment' as const,
          deadline: new Date(Date.now() + 86400000).toISOString(),
          depends_on: [],
          status: 'open' as const,
          action_class: 'AUTO' as const,
          audit_log: [],
        },
      ],
      blocked_tasks: [],
      stale_tasks: [],
      pending_confirmations: [],
      summary: { total_open: 1, due_in_7_days: 1, blocked: 0, stale: 0, human_required: 0 },
    };

    // Client that fails with Bedrock rate limit or auth failure
    const failingClient = {
      send: vi.fn().mockRejectedValue(new Error('ThrottlingException: Rate exceeded')),
    } as unknown as BedrockRuntimeClient;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateSmartBrief(briefData, failingClient);

    expect(result.source).toBe('fallback_structured');
    expect(result.brief).toContain('Physics Lab');
    expect(result.warning).toContain('Rate exceeded');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('gracefully falls back when no AWS credentials are configured in environment', async () => {
    // Save and clear AWS env vars
    const oldKey = process.env.AWS_ACCESS_KEY_ID;
    const oldSecret = process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    try {
      const briefData = {
        generated_at: new Date().toISOString(),
        tasks_due_soon: [],
        blocked_tasks: [],
        stale_tasks: [],
        pending_confirmations: [],
        summary: { total_open: 0, due_in_7_days: 0, blocked: 0, stale: 0, human_required: 0 },
      };

      const result = await generateSmartBrief(briefData);
      expect(result.source).toBe('fallback_structured');
      expect(result.brief).toBeDefined();
    } finally {
      if (oldKey) process.env.AWS_ACCESS_KEY_ID = oldKey;
      if (oldSecret) process.env.AWS_SECRET_ACCESS_KEY = oldSecret;
    }
  });

  it('throws an error if AWS_REGION is missing when initializing Bedrock client', () => {
    const oldRegion = process.env.AWS_REGION;
    delete process.env.AWS_REGION;
    try {
      expect(() => getBedrockClient()).toThrow(/AWS_REGION/);
    } finally {
      if (oldRegion) process.env.AWS_REGION = oldRegion;
    }
  });

  it('correctly detects authentication method: bearer token, access key, or none', () => {
    const oldToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
    const oldKey = process.env.AWS_ACCESS_KEY_ID;
    const oldSecret = process.env.AWS_SECRET_ACCESS_KEY;

    try {
      // 1. None
      delete process.env.AWS_BEARER_TOKEN_BEDROCK;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      expect(detectBedrockAuthMethod()).toBe('none');

      // 2. Bearer token
      process.env.AWS_BEARER_TOKEN_BEDROCK = 'test-bearer-token';
      expect(detectBedrockAuthMethod()).toBe('bearer token');

      // 3. Access key
      delete process.env.AWS_BEARER_TOKEN_BEDROCK;
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      expect(detectBedrockAuthMethod()).toBe('access key');
    } finally {
      if (oldToken) process.env.AWS_BEARER_TOKEN_BEDROCK = oldToken; else delete process.env.AWS_BEARER_TOKEN_BEDROCK;
      if (oldKey) process.env.AWS_ACCESS_KEY_ID = oldKey; else delete process.env.AWS_ACCESS_KEY_ID;
      if (oldSecret) process.env.AWS_SECRET_ACCESS_KEY = oldSecret; else delete process.env.AWS_SECRET_ACCESS_KEY;
    }
  });

  it('logBedrockStartup logs detected auth method or throws if AWS_REGION is missing', () => {
    const oldRegion = process.env.AWS_REGION;
    const oldToken = process.env.AWS_BEARER_TOKEN_BEDROCK;

    try {
      delete process.env.AWS_REGION;
      expect(() => logBedrockStartup()).toThrow(/AWS_REGION/);

      process.env.AWS_REGION = 'ap-southeast-2';
      process.env.AWS_BEARER_TOKEN_BEDROCK = 'test-token';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logBedrockStartup();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('bearer token'));
      logSpy.mockRestore();
    } finally {
      if (oldRegion) process.env.AWS_REGION = oldRegion; else delete process.env.AWS_REGION;
      if (oldToken) process.env.AWS_BEARER_TOKEN_BEDROCK = oldToken; else delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    }
  });
});

describe('Phase 3 — MCP Streamable HTTP Integration for get_smart_brief', () => {
  let server: Server;
  let serverUrl: string;

  beforeEach(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    closeDb();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    const { app } = createCampusOpsApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        serverUrl = `http://127.0.0.1:${address.port}/mcp`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    closeDb();
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch {}
    }
  });

  it('exposes get_smart_brief and returns natural language briefing over Streamable HTTP', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

    try {
      await client.connect(transport);

      // Seed a task
      createTask({
        id: 't-smart-1',
        title: 'Algorithms Homework 4',
        category: 'assignment',
        deadline: new Date(Date.now() + 86400000 * 2).toISOString(),
      });

      // 1. Verify get_smart_brief is registered in tools/list
      const list = await client.listTools();
      const toolNames = list.tools.map((t) => t.name);
      expect(toolNames).toContain('get_smart_brief');

      // 2. Execute get_smart_brief via tools/call
      const callResult = (await client.callTool({
        name: 'get_smart_brief',
        arguments: {},
      })) as any;

      expect(callResult.isError).toBeFalsy();
      expect(callResult.content).toBeDefined();
      expect(callResult.content[0].type).toBe('text');
      expect(typeof callResult.content[0].text).toBe('string');
      expect(callResult.content[0].text.length).toBeGreaterThan(10);
      expect(callResult.source).toBe('fallback_structured');
    } finally {
      await client.close();
    }
  });
});
