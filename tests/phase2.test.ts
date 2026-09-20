import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  getDb,
  closeDb,
  createTask,
  getTask,
  updateTask,
  proposeAction,
  confirmAction,
  getWeeklyBriefData,
} from '../src/db.js';
import { createCampusOpsApp } from '../src/server.js';
import type { Server } from 'node:http';

const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test_phase2_campus_ops.db');

describe('Phase 2 — Guarded Actions, Invariants & Audit Trail', () => {
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

  it('rejects direct status changes on HUMAN_REQUIRED tasks via update_task', () => {
    const feeTask = createTask({
      id: 'fee-tuition',
      title: 'Tuition Fee Payment',
      category: 'fee',
      action_class: 'HUMAN_REQUIRED',
      deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
    });

    expect(feeTask.status).toBe('open');
    expect(feeTask.action_class).toBe('HUMAN_REQUIRED');

    // Attempting direct status change must throw
    expect(() => {
      updateTask({
        id: 'fee-tuition',
        status: 'done',
      });
    }).toThrow(/Direct status update on HUMAN_REQUIRED task "fee-tuition" is forbidden/);

    // State must remain unchanged
    const unchanged = getTask('fee-tuition');
    expect(unchanged?.status).toBe('open');
  });

  it('allows propose_action without changing state and appends to audit log', () => {
    createTask({
      id: 'fee-tuition',
      title: 'Tuition Fee Payment',
      category: 'fee',
      action_class: 'HUMAN_REQUIRED',
      deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
    });

    const proposal = proposeAction('fee-tuition', 'pay_fee');

    expect(proposal.task_id).toBe('fee-tuition');
    expect(proposal.action).toBe('pay_fee');
    expect(proposal.requires_confirmation).toBe(true);
    expect(proposal.reason).toContain('HUMAN_REQUIRED');
    expect(proposal.proposed_at).toBeDefined();

    // Verify task state is NOT changed
    const taskAfter = getTask('fee-tuition');
    expect(taskAfter?.status).toBe('open');

    // Verify audit log has the proposal entry
    const auditLogs = taskAfter?.audit_log || [];
    expect(auditLogs.some((l) => l.event === 'ACTION_PROPOSED' && l.note?.includes('pay_fee'))).toBe(true);
  });

  it('handles confirm_action with confirmed=false: leaves state unchanged and logs rejection', () => {
    createTask({
      id: 'fee-tuition',
      title: 'Tuition Fee Payment',
      category: 'fee',
      action_class: 'HUMAN_REQUIRED',
      deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
    });

    // Propose first
    proposeAction('fee-tuition', 'pay_fee');

    // Confirm with false
    const rejectionResult = confirmAction('fee-tuition', 'pay_fee', false, 'Student declined payment at this time');
    expect(rejectionResult.confirmed).toBe(false);
    expect(rejectionResult.status).toBe('open');

    // Verify state unchanged
    const taskAfter = getTask('fee-tuition');
    expect(taskAfter?.status).toBe('open');

    // Verify audit trail records rejection
    const auditLogs = taskAfter?.audit_log || [];
    expect(auditLogs.some((l) => l.event === 'ACTION_REJECTED')).toBe(true);
  });

  it('handles confirm_action with confirmed=true: mutates state, logs audit, and unblocks downstream tasks', () => {
    // Task 1: Prerequisite project specification (HUMAN_REQUIRED)
    createTask({
      id: 'project-spec',
      title: 'Project Architecture Spec',
      category: 'project',
      action_class: 'HUMAN_REQUIRED',
      deadline: new Date(Date.now() + 86400000 * 4).toISOString(),
    });

    // Task 2: Implementation dependent on spec
    createTask({
      id: 'project-code',
      title: 'Project Codebase Submission',
      category: 'project',
      action_class: 'HUMAN_REQUIRED',
      deadline: new Date(Date.now() + 86400000 * 8).toISOString(),
      depends_on: ['project-spec'],
    });

    // project-code must initially be blocked
    expect(getTask('project-code')?.status).toBe('blocked');

    // Propose action on spec
    proposeAction('project-spec', 'submit_project');

    // Confirm action on spec
    const confirmResult = confirmAction('project-spec', 'submit_project', true, 'Advisor signoff obtained');
    expect(confirmResult.confirmed).toBe(true);
    expect(confirmResult.status).toBe('done');

    // Verify spec is done and has both proposed and confirmed logs
    const updatedSpec = getTask('project-spec');
    expect(updatedSpec?.status).toBe('done');
    const logEvents = updatedSpec?.audit_log.map((l) => l.event);
    expect(logEvents).toContain('ACTION_PROPOSED');
    expect(logEvents).toContain('ACTION_CONFIRMED');

    // Verify downstream project-code is now automatically unblocked to open
    const updatedCode = getTask('project-code');
    expect(updatedCode?.status).toBe('open');
  });

  it('refuses to advance blocked tasks to done via confirm_action or update_task', () => {
    createTask({
      id: 'prereq-task',
      title: 'Incomplete Prerequisite',
      category: 'assignment',
      action_class: 'AUTO',
      deadline: new Date(Date.now() + 86400000 * 2).toISOString(),
    });

    createTask({
      id: 'blocked-task',
      title: 'Blocked Capstone',
      category: 'project',
      action_class: 'HUMAN_REQUIRED',
      deadline: new Date(Date.now() + 86400000 * 5).toISOString(),
      depends_on: ['prereq-task'],
    });

    expect(getTask('blocked-task')?.status).toBe('blocked');

    // Attempting confirm_action on a blocked task must fail
    expect(() => {
      confirmAction('blocked-task', 'submit_project', true);
    }).toThrow(/task is blocked by incomplete prerequisite tasks/);

    expect(getTask('blocked-task')?.status).toBe('blocked');
  });

  it('generates structured weekly brief with tasks due soon, blockers, and stale items', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // 1. Task due in 2 days (due soon)
    createTask({
      id: 'due-soon-task',
      title: 'Chemistry Lab Report',
      category: 'assignment',
      deadline: new Date(now + 2 * day).toISOString(),
    });

    // 2. Prerequisite task (due in 12 days, open)
    createTask({
      id: 'blocker-task',
      title: 'Hardware Spec Review',
      category: 'assignment',
      deadline: new Date(now + 12 * day).toISOString(),
    });

    // 3. Blocked task (depends on blocker-task)
    createTask({
      id: 'blocked-sub',
      title: 'Hardware PCB Order',
      category: 'project',
      deadline: new Date(now + 5 * day).toISOString(),
      depends_on: ['blocker-task'],
    });

    // 4. Stale task (deadline passed 2 days ago)
    createTask({
      id: 'overdue-fee',
      title: 'Library Fine',
      category: 'fee',
      deadline: new Date(now - 2 * day).toISOString(),
    });

    const brief = getWeeklyBriefData(now);

    expect(brief.tasks_due_soon.some((t) => t.id === 'due-soon-task')).toBe(true);
    expect(brief.stale_tasks.some((t) => t.id === 'overdue-fee')).toBe(true);

    const blockedItem = brief.blocked_tasks.find((b) => b.task.id === 'blocked-sub');
    expect(blockedItem).toBeDefined();
    expect(blockedItem?.blocked_by.some((dep) => dep.id === 'blocker-task')).toBe(true);

    expect(brief.summary.due_in_7_days).toBeGreaterThanOrEqual(1);
    expect(brief.summary.blocked).toBeGreaterThanOrEqual(1);
    expect(brief.summary.stale).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase 2 — MCP Streamable HTTP Integration for Guarded Tools', () => {
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

  it('exposes propose_action, confirm_action, and get_weekly_brief via tools/list', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

    try {
      await client.connect(transport);
      const list = await client.listTools();
      const toolNames = list.tools.map((t) => t.name);

      expect(toolNames).toContain('propose_action');
      expect(toolNames).toContain('confirm_action');
      expect(toolNames).toContain('get_weekly_brief');
      expect(toolNames).toContain('update_task');
    } finally {
      await client.close();
    }
  });

  it('rejects direct update_task on fee, executes propose_action, and completes via confirm_action over MCP', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

    try {
      await client.connect(transport);

      // 1. Create a fee task (HUMAN_REQUIRED)
      await client.callTool({
        name: 'create_task',
        arguments: {
          id: 'tuition-installment',
          title: 'Spring Tuition Installment',
          category: 'fee',
          deadline: new Date(Date.now() + 86400000 * 5).toISOString(),
          action_class: 'HUMAN_REQUIRED',
        },
      });

      // 2. Direct update_task attempt to set status to 'done' MUST fail
      const directUpdateRes = (await client.callTool({
        name: 'update_task',
        arguments: {
          id: 'tuition-installment',
          status: 'done',
        },
      })) as any;

      expect(directUpdateRes.isError).toBe(true);
      expect(directUpdateRes.content[0].text).toContain('Direct status update on HUMAN_REQUIRED task');

      // 3. Propose action
      const proposeRes = (await client.callTool({
        name: 'propose_action',
        arguments: {
          task_id: 'tuition-installment',
          action: 'pay_fee',
        },
      })) as any;

      expect(proposeRes.isError).toBeFalsy();
      const proposal = JSON.parse(proposeRes.content[0].text);
      expect(proposal.requires_confirmation).toBe(true);
      expect(proposal.task_id).toBe('tuition-installment');

      // 4. Confirm action with confirmed=true
      const confirmRes = (await client.callTool({
        name: 'confirm_action',
        arguments: {
          task_id: 'tuition-installment',
          action: 'pay_fee',
          confirmed: true,
          note: 'Bank transaction confirmed #TX12345',
        },
      })) as any;

      expect(confirmRes.isError).toBeFalsy();
      const confirmResult = JSON.parse(confirmRes.content[0].text);
      expect(confirmResult.confirmed).toBe(true);
      expect(confirmResult.status).toBe('done');

      // 5. Query get_weekly_brief over MCP
      const briefRes = (await client.callTool({
        name: 'get_weekly_brief',
        arguments: {},
      })) as any;

      expect(briefRes.isError).toBeFalsy();
      const brief = JSON.parse(briefRes.content[0].text);
      expect(brief.summary).toBeDefined();
      expect(Array.isArray(brief.tasks_due_soon)).toBe(true);
    } finally {
      await client.close();
    }
  });
});
