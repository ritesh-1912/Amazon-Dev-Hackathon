import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  getDb,
  closeDb,
  clearDatabase,
  createTask,
  getTask,
  updateTask,
  listTasks,
} from '../src/db.js';
import { createCampusOpsApp } from '../src/server.js';
import type { Server } from 'node:http';

const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test_campus_ops.db');

describe('Phase 1 — MCP Server Core & Persistence', () => {
  beforeEach(() => {
    process.env.DB_PATH = TEST_DB_PATH;
    closeDb();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    getDb(TEST_DB_PATH);
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch {}
    }
  });

  it('persists tasks across database reconnects (server restarts)', () => {
    const task = createTask({
      id: 'test-persist-1',
      title: 'Operating Systems Lab 1',
      category: 'assignment',
      deadline: new Date(Date.now() + 86400000).toISOString(),
    });

    expect(task.id).toBe('test-persist-1');
    expect(task.status).toBe('open');
    expect(task.audit_log.length).toBeGreaterThan(0);

    // Simulate server restart by closing db and opening again
    closeDb();
    const reopenedDb = getDb(TEST_DB_PATH);
    const retrieved = getTask('test-persist-1', reopenedDb);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('test-persist-1');
    expect(retrieved?.title).toBe('Operating Systems Lab 1');
    expect(retrieved?.status).toBe('open');
    expect(retrieved?.audit_log[0].event).toBe('CREATED');
  });

  it('enforces dependency blocking and unblocks dynamically when dependency is done', () => {
    // Create prerequisite task
    const parentTask = createTask({
      id: 'parent-task',
      title: 'Literature Review Draft',
      category: 'project',
      deadline: new Date(Date.now() + 5 * 86400000).toISOString(),
    });
    expect(parentTask.status).toBe('open');

    // Create dependent task
    const childTask = createTask({
      id: 'child-task',
      title: 'Final Thesis Submission',
      category: 'project',
      deadline: new Date(Date.now() + 10 * 86400000).toISOString(),
      depends_on: ['parent-task'],
    });
    // Status must be blocked because parent-task is not done
    expect(childTask.status).toBe('blocked');

    // Mark parent task as done
    updateTask({
      id: 'parent-task',
      status: 'done',
      note: 'Supervisor approved draft',
    });

    // Verify parent is done
    const updatedParent = getTask('parent-task');
    expect(updatedParent?.status).toBe('done');

    // Verify child task is now automatically unblocked to open
    const updatedChild = getTask('child-task');
    expect(updatedChild?.status).toBe('open');
    expect(updatedChild?.audit_log.length).toBeGreaterThan(0);
  });

  it('detects and marks overdue tasks as stale', () => {
    const overdueTask = createTask({
      id: 'overdue-task',
      title: 'Late Lab Fee',
      category: 'fee',
      deadline: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    });

    expect(overdueTask.status).toBe('stale');

    // Completing it changes status to done
    const completed = updateTask({
      id: 'overdue-task',
      status: 'done',
      note: 'Paid at bursar window',
    });
    expect(completed.status).toBe('done');
  });

  it('supports listing tasks with category and status filters', () => {
    createTask({
      id: 'task-a',
      title: 'Assignment A',
      category: 'assignment',
      deadline: new Date(Date.now() + 86400000).toISOString(),
    });
    createTask({
      id: 'task-b',
      title: 'Fee B',
      category: 'fee',
      deadline: new Date(Date.now() + 86400000).toISOString(),
    });

    const assignments = listTasks({ category: 'assignment' });
    expect(assignments.some((t) => t.id === 'task-a')).toBe(true);
    expect(assignments.some((t) => t.id === 'task-b')).toBe(false);

    const fees = listTasks({ category: 'fee' });
    expect(fees.some((t) => t.id === 'task-b')).toBe(true);
    expect(fees.some((t) => t.id === 'task-a')).toBe(false);
  });
});

describe('Phase 1 — Streamable HTTP MCP Integration', () => {
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

  it('completes initialize and tools/list lifecycle over Streamable HTTP', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

    try {
      await client.connect(transport);

      const toolList = await client.listTools();
      const toolNames = toolList.tools.map((t) => t.name);

      expect(toolNames).toContain('create_task');
      expect(toolNames).toContain('list_tasks');
      expect(toolNames).toContain('get_task');
      expect(toolNames).toContain('update_task');
    } finally {
      await client.close();
    }
  });

  it('executes create_task, list_tasks, and update_task via tools/call', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

    try {
      await client.connect(transport);

      // 1. Create a task
      const createResult = (await client.callTool({
        name: 'create_task',
        arguments: {
          id: 'mcp-task-1',
          title: 'MCP Protocol Homework',
          category: 'assignment',
          deadline: new Date(Date.now() + 86400000).toISOString(),
          action_class: 'AUTO',
        },
      })) as any;

      expect(createResult.isError).toBeFalsy();
      const createdTask = JSON.parse(createResult.content[0].text);
      expect(createdTask.id).toBe('mcp-task-1');
      expect(createdTask.title).toBe('MCP Protocol Homework');
      expect(createdTask.status).toBe('open');

      // 2. List tasks
      const listResult = (await client.callTool({
        name: 'list_tasks',
        arguments: {},
      })) as any;

      const taskList = JSON.parse(listResult.content[0].text);
      expect(taskList.length).toBeGreaterThan(0);
      expect(taskList.some((t: any) => t.id === 'mcp-task-1')).toBe(true);

      // 3. Update task
      const updateResult = (await client.callTool({
        name: 'update_task',
        arguments: {
          id: 'mcp-task-1',
          status: 'done',
          note: 'Submitted via Canvas',
        },
      })) as any;

      const updatedTask = JSON.parse(updateResult.content[0].text);
      expect(updatedTask.status).toBe('done');
      expect(updatedTask.audit_log.some((l: any) => l.note === 'Submitted via Canvas')).toBe(true);

      // 4. Get task
      const getResult = (await client.callTool({
        name: 'get_task',
        arguments: { id: 'mcp-task-1' },
      })) as any;

      const fetchedTask = JSON.parse(getResult.content[0].text);
      expect(fetchedTask.id).toBe('mcp-task-1');
      expect(fetchedTask.status).toBe('done');
    } finally {
      await client.close();
    }
  });

  it('rejects invalid inputs with clear error messages without crashing', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

    try {
      await client.connect(transport);

      // Call get_task for a non-existent ID
      const notFoundResult = (await client.callTool({
        name: 'get_task',
        arguments: { id: 'does-not-exist' },
      })) as any;

      expect(notFoundResult.isError).toBe(true);
      expect(notFoundResult.content[0].text).toContain('not found');

      // Call create_task with an invalid category (should return MCP error -32602)
      const invalidResult = (await client.callTool({
        name: 'create_task',
        arguments: {
          title: 'Invalid Category Task',
          category: 'invalid_category',
          deadline: new Date().toISOString(),
        },
      })) as any;

      expect(invalidResult.isError).toBe(true);
      expect(invalidResult.content[0].text).toContain('Invalid enum value');
    } finally {
      await client.close();
    }
  });
});
