import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Task, CreateTaskInput, UpdateTaskInput, TaskFilter, AuditLogEntry, TaskStatus, ActionClass, TaskCategory } from './types.js';

let dbInstance: Database.Database | null = null;

export function getDb(dbPath?: string): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const resolvedPath = dbPath || process.env.DB_PATH || path.join(process.cwd(), 'data', 'campus_ops.db');
  
  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  dbInstance = new Database(resolvedPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  initSchema(dbInstance);
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function setDb(db: Database.Database): void {
  if (dbInstance && dbInstance !== db) {
    dbInstance.close();
  }
  dbInstance = db;
  initSchema(dbInstance);
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('assignment', 'fee', 'project', 'library', 'other')),
      deadline TEXT NOT NULL,
      depends_on TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL CHECK(status IN ('open', 'blocked', 'done', 'stale')),
      action_class TEXT NOT NULL CHECK(action_class IN ('AUTO', 'HUMAN_REQUIRED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      event TEXT NOT NULL,
      note TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
    CREATE INDEX IF NOT EXISTS idx_audit_task_id ON audit_logs(task_id);
  `);
}

/**
 * Determine dynamic status according to business rules:
 * - A task that is "done" remains "done".
 * - A task is "blocked" if any task in depends_on is not "done".
 * - A task is "stale" if its deadline has passed and it's still not "done".
 * - Otherwise it is "open".
 */
export function computeTaskStatus(
  currentStatus: TaskStatus,
  deadline: string,
  dependsOn: string[],
  allTasksMap: Map<string, { status: TaskStatus }>
): TaskStatus {
  if (currentStatus === 'done') {
    return 'done';
  }

  // Check if any dependency is not done
  for (const depId of dependsOn) {
    const depTask = allTasksMap.get(depId);
    if (!depTask || depTask.status !== 'done') {
      return 'blocked';
    }
  }

  // Check if overdue
  const deadlineTime = new Date(deadline).getTime();
  if (!isNaN(deadlineTime) && deadlineTime < Date.now()) {
    return 'stale';
  }

  return 'open';
}

/**
 * Recalculate and persist statuses for all non-done tasks based on dependencies and deadlines
 */
export function refreshAllTaskStatuses(db: Database.Database = getDb()): void {
  const rows = db.prepare('SELECT id, status, deadline, depends_on FROM tasks').all() as Array<{
    id: string;
    status: TaskStatus;
    deadline: string;
    depends_on: string;
  }>;

  const taskMap = new Map<string, { status: TaskStatus }>();
  for (const row of rows) {
    taskMap.set(row.id, { status: row.status });
  }

  const updateStmt = db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();

  // Multi-pass to handle chains of dependencies
  let changed = true;
  let passes = 0;
  while (changed && passes < 10) {
    changed = false;
    passes++;

    for (const row of rows) {
      if (row.status === 'done') continue;

      const deps: string[] = JSON.parse(row.depends_on);
      const computed = computeTaskStatus(row.status, row.deadline, deps, taskMap);

      if (computed !== row.status) {
        row.status = computed;
        taskMap.set(row.id, { status: computed });
        updateStmt.run(computed, now, row.id);
        changed = true;
      }
    }
  }
}

function rowToTask(row: any, auditLogs: AuditLogEntry[]): Task {
  return {
    id: row.id,
    title: row.title,
    category: row.category as TaskCategory,
    deadline: row.deadline,
    depends_on: JSON.parse(row.depends_on || '[]'),
    status: row.status as TaskStatus,
    action_class: row.action_class as ActionClass,
    audit_log: auditLogs,
  };
}

export function getAuditLogsForTask(taskId: string, db: Database.Database = getDb()): AuditLogEntry[] {
  const rows = db
    .prepare('SELECT timestamp, event, note FROM audit_logs WHERE task_id = ? ORDER BY id ASC')
    .all(taskId) as Array<{ timestamp: string; event: string; note: string | null }>;

  return rows.map((r) => ({
    timestamp: r.timestamp,
    event: r.event,
    ...(r.note ? { note: r.note } : {}),
  }));
}

export function addAuditLog(
  taskId: string,
  event: string,
  note?: string,
  timestamp: string = new Date().toISOString(),
  db: Database.Database = getDb()
): void {
  db.prepare('INSERT INTO audit_logs (task_id, timestamp, event, note) VALUES (?, ?, ?, ?)').run(
    taskId,
    timestamp,
    event,
    note || null
  );
}

export function getTask(id: string, db: Database.Database = getDb()): Task | null {
  refreshAllTaskStatuses(db);
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
  if (!row) return null;

  const logs = getAuditLogsForTask(id, db);
  return rowToTask(row, logs);
}

export function listTasks(filter?: TaskFilter, db: Database.Database = getDb()): Task[] {
  refreshAllTaskStatuses(db);

  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params: any[] = [];

  if (filter?.status) {
    query += ' AND status = ?';
    params.push(filter.status);
  }

  if (filter?.category) {
    query += ' AND category = ?';
    params.push(filter.category);
  }

  query += ' ORDER BY deadline ASC';

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((row) => {
    const logs = getAuditLogsForTask(row.id, db);
    return rowToTask(row, logs);
  });
}

export function createTask(input: CreateTaskInput, db: Database.Database = getDb()): Task {
  const id = input.id || `task_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const dependsOn = input.depends_on || [];
  
  // Default action_class: fee and project are HUMAN_REQUIRED, others AUTO
  const actionClass = input.action_class || (input.category === 'fee' || input.category === 'project' ? 'HUMAN_REQUIRED' : 'AUTO');

  // Compute initial status
  const allRows = db.prepare('SELECT id, status FROM tasks').all() as Array<{ id: string; status: TaskStatus }>;
  const map = new Map<string, { status: TaskStatus }>();
  for (const r of allRows) map.set(r.id, { status: r.status });

  const initialStatus = computeTaskStatus('open', input.deadline, dependsOn, map);

  const insertStmt = db.prepare(`
    INSERT INTO tasks (id, title, category, deadline, depends_on, status, action_class, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    id,
    input.title,
    input.category,
    input.deadline,
    JSON.stringify(dependsOn),
    initialStatus,
    actionClass,
    now,
    now
  );

  addAuditLog(id, 'CREATED', input.note || `Task created with status ${initialStatus}`, now, db);

  refreshAllTaskStatuses(db);
  return getTask(id, db)!;
}

export function updateTask(input: UpdateTaskInput, db: Database.Database = getDb()): Task {
  const existing = getTask(input.id, db);
  if (!existing) {
    throw new Error(`Task with id "${input.id}" not found`);
  }

  const now = new Date().toISOString();
  let updatedTitle = input.title ?? existing.title;
  let updatedDeadline = input.deadline ?? existing.deadline;
  let updatedDependsOn = input.depends_on ?? existing.depends_on;
  let updatedActionClass = input.action_class ?? existing.action_class;
  let requestedStatus = input.status ?? existing.status;

  // Update record in database
  db.prepare(`
    UPDATE tasks
    SET title = ?, deadline = ?, depends_on = ?, status = ?, action_class = ?, updated_at = ?
    WHERE id = ?
  `).run(
    updatedTitle,
    updatedDeadline,
    JSON.stringify(updatedDependsOn),
    requestedStatus,
    updatedActionClass,
    now,
    input.id
  );

  // Append audit log for update
  const eventDetails = [];
  if (input.status && input.status !== existing.status) eventDetails.push(`status changed from ${existing.status} to ${input.status}`);
  if (input.title && input.title !== existing.title) eventDetails.push(`title updated`);
  if (input.deadline && input.deadline !== existing.deadline) eventDetails.push(`deadline updated to ${input.deadline}`);
  if (input.depends_on) eventDetails.push(`dependencies updated`);

  const auditEvent = eventDetails.length > 0 ? `UPDATED: ${eventDetails.join(', ')}` : 'UPDATED';
  addAuditLog(input.id, auditEvent, input.note, now, db);

  // Trigger cascade refresh of statuses (e.g. if this task was marked 'done', unblock dependents)
  refreshAllTaskStatuses(db);

  return getTask(input.id, db)!;
}

export function clearDatabase(db: Database.Database = getDb()): void {
  db.prepare('DELETE FROM audit_logs').run();
  db.prepare('DELETE FROM tasks').run();
}
