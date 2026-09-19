import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createTask,
  listTasks,
  getTask,
  updateTask,
} from './db.js';
import type { TaskCategory, TaskStatus, ActionClass } from './types.js';

export function registerTaskTools(server: McpServer): void {
  // 1. create_task
  server.tool(
    'create_task',
    'Create a new academic task or obligation (e.g. assignment, fee, project milestone, library return).',
    {
      id: z.string().optional().describe('Optional custom ID for the task'),
      title: z.string().min(1, 'Title must not be empty').describe('Title of the task or milestone'),
      category: z.enum(['assignment', 'fee', 'project', 'library', 'other']).describe('Category of task'),
      deadline: z
        .string()
        .refine((val) => !isNaN(Date.parse(val)), {
          message: 'Deadline must be a valid ISO-8601 date string',
        })
        .describe('Due date in ISO-8601 format (e.g. 2026-10-01T23:59:59Z)'),
      depends_on: z
        .array(z.string())
        .optional()
        .describe('List of task IDs that must be completed (done) before this task can be worked on'),
      action_class: z
        .enum(['AUTO', 'HUMAN_REQUIRED'])
        .optional()
        .describe('HUMAN_REQUIRED for state-altering operations like paying fees or project submissions, AUTO for routine changes'),
      note: z.string().optional().describe('Optional note or reason for creation'),
    },
    async (args) => {
      try {
        const task = createTask({
          id: args.id,
          title: args.title,
          category: args.category as TaskCategory,
          deadline: args.deadline,
          depends_on: args.depends_on,
          action_class: args.action_class as ActionClass | undefined,
          note: args.note,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(task, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to create task: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // 2. list_tasks
  server.tool(
    'list_tasks',
    'List all academic tasks with dynamic status evaluation (open, blocked, done, stale), optionally filtered by status or category.',
    {
      status: z
        .enum(['open', 'blocked', 'done', 'stale'])
        .optional()
        .describe('Filter by task status'),
      category: z
        .enum(['assignment', 'fee', 'project', 'library', 'other'])
        .optional()
        .describe('Filter by category'),
    },
    async (args) => {
      try {
        const tasks = listTasks({
          status: args.status as TaskStatus | undefined,
          category: args.category as TaskCategory | undefined,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(tasks, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to list tasks: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // 3. get_task
  server.tool(
    'get_task',
    'Retrieve details of a specific task by its unique ID, including status and audit history.',
    {
      id: z.string().min(1, 'Task ID cannot be empty').describe('Unique ID of the task'),
    },
    async (args) => {
      try {
        const task = getTask(args.id);
        if (!task) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Task with id "${args.id}" not found`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(task, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to get task: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // 4. update_task
  server.tool(
    'update_task',
    'Update an existing task status, title, deadline, or dependencies. Records changes in the audit log.',
    {
      id: z.string().min(1, 'Task ID cannot be empty').describe('Unique ID of the task to update'),
      status: z
        .enum(['open', 'blocked', 'done', 'stale'])
        .optional()
        .describe('New status for the task'),
      title: z.string().min(1).optional().describe('Updated title'),
      deadline: z
        .string()
        .refine((val) => !val || !isNaN(Date.parse(val)), {
          message: 'Deadline must be a valid ISO-8601 date string',
        })
        .optional()
        .describe('Updated ISO-8601 deadline'),
      depends_on: z.array(z.string()).optional().describe('Updated dependency list'),
      note: z.string().optional().describe('Audit log note explaining this update'),
    },
    async (args) => {
      try {
        const updated = updateTask({
          id: args.id,
          status: args.status as TaskStatus | undefined,
          title: args.title,
          deadline: args.deadline,
          depends_on: args.depends_on,
          note: args.note,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(updated, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to update task: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
