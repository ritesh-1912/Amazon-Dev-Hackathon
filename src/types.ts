export type TaskCategory = 'assignment' | 'fee' | 'project' | 'library' | 'other';

export type TaskStatus = 'open' | 'blocked' | 'done' | 'stale';

export type ActionClass = 'AUTO' | 'HUMAN_REQUIRED';

export interface AuditLogEntry {
  timestamp: string;
  event: string;
  note?: string;
}

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  deadline: string; // ISO date string
  depends_on: string[]; // ids of tasks that must be DONE first
  status: TaskStatus;
  action_class: ActionClass;
  audit_log: AuditLogEntry[];
}

export interface CreateTaskInput {
  id?: string;
  title: string;
  category: TaskCategory;
  deadline: string;
  depends_on?: string[];
  action_class?: ActionClass;
  note?: string;
}

export interface UpdateTaskInput {
  id: string;
  status?: TaskStatus;
  title?: string;
  deadline?: string;
  depends_on?: string[];
  action_class?: ActionClass;
  note?: string;
}

export interface TaskFilter {
  status?: TaskStatus;
  category?: TaskCategory;
}
