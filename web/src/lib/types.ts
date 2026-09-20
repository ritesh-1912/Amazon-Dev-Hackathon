export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCall?: {
    tool: string;
    args: Record<string, unknown>;
  };
  proposal?: {
    task_id: string;
    action: string;
    task_title: string;
    requires_confirmation: boolean;
  };
}

export interface Task {
  id: string;
  title: string;
  category: string;
  deadline: string;
  depends_on: string[];
  status: 'open' | 'blocked' | 'done' | 'stale';
  action_class: 'AUTO' | 'HUMAN_REQUIRED';
  audit_log: Array<{ timestamp: string; event: string; note?: string }>;
}
