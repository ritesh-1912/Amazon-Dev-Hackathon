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
  /** Internal flag to permit mutation from confirm_action */
  bypass_human_guard?: boolean;
}

export interface TaskFilter {
  status?: TaskStatus;
  category?: TaskCategory;
}

export interface ActionProposal {
  task_id: string;
  action: string;
  requires_confirmation: boolean;
  reason: string;
  task_title: string;
  action_class: ActionClass;
  proposed_at: string;
}

export interface ActionConfirmationResult {
  task_id: string;
  action: string;
  confirmed: boolean;
  status: TaskStatus;
  message: string;
  task?: Task;
}

export interface BlockedTaskInfo {
  task: Task;
  blocked_by: Array<{ id: string; title: string; status: TaskStatus }>;
}

export interface WeeklyBrief {
  generated_at: string;
  tasks_due_soon: Task[];
  blocked_tasks: BlockedTaskInfo[];
  stale_tasks: Task[];
  pending_confirmations: Task[];
  summary: {
    total_open: number;
    due_in_7_days: number;
    blocked: number;
    stale: number;
    human_required: number;
  };
}
