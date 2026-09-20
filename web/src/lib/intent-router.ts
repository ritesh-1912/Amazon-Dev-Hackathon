// Intent router: maps freeform user text to MCP tool calls

export interface IntentResult {
  tool: string;
  args: Record<string, unknown>;
  displayIntent: string;
}

interface Pattern {
  regex: RegExp;
  handler: (match: RegExpMatchArray, input: string) => IntentResult;
}

const patterns: Pattern[] = [
  // 1. Smart Brief / Weekly Brief
  // e.g. "what's due", "what is due", "weekly brief", "give me my morning brief", "morning brief"
  {
    regex: /\b(brief|morning|what(?:'s|\s+is|\s+do\s+i\s+have)\s+(?:due|pending|up|going\s+on|happening)|summary|overview|status\s+report|daily)\b/i,
    handler: () => ({
      tool: 'get_smart_brief',
      args: {},
      displayIntent: 'Generating your smart ops brief...',
    }),
  },

  // 2. What's blocked / Blocker inquiries
  // e.g. "what's blocked", "what is blocked", "why is my project blocked", "show blocked tasks", "blockers"
  {
    regex: /\b(what(?:'s|\s+is)?\s+blocked|why\s+is\s+.*blocked|blocked\s+tasks?|blockers?|show\s+blocked)\b/i,
    handler: () => ({
      tool: 'list_tasks',
      args: { status: 'blocked' },
      displayIntent: 'Checking blocked tasks and prerequisites...',
    }),
  },

  // 3. What's overdue / stale
  // e.g. "what's overdue", "what is late", "show overdue", "stale tasks"
  {
    regex: /\b(what(?:'s|\s+is)?\s+(?:overdue|late|past\s+due)|overdue|stale|late\s+tasks?|missed\s+deadlines?)\b/i,
    handler: () => ({
      tool: 'list_tasks',
      args: { status: 'stale' },
      displayIntent: 'Checking overdue tasks...',
    }),
  },

  // 4. Complete dependency / Prerequisite tasks
  // e.g. "complete its dependency", "complete dependency", "finish dependency", "unblock milestone"
  {
    regex: /\b(complete|finish|resolve|clear)\s+(?:its\s+)?dependenc(?:y|ies)\b/i,
    handler: () => ({
      tool: 'propose_action',
      args: { task_id: 'task-cs301-design', action: 'submit_project' },
      displayIntent: 'Proposing completion of prerequisite CS 301 architecture spec (task-cs301-design)...',
    }),
  },

  // 5. Pay fee / Mark fee paid
  // e.g. "mark fees paid", "mark fee paid", "mark fees as paid", "pay tuition", "pay spring tuition", "pay fee", "settle tuition"
  {
    regex: /\b(?:pay|settle)\s+(.*?)(?:\s+fees?)?\s*$|\bmark\s+(.*?)\s+(?:as\s+)?paid\b|\bmark\s+fees?\s+paid\b/i,
    handler: (match, input) => {
      const idMatch = input.match(/\b(task-[\w-]+)\b/i);
      const taskId = idMatch?.[1] || inferFeeTaskId(input);
      return {
        tool: 'propose_action',
        args: { task_id: taskId, action: 'pay_fee' },
        displayIntent: `Proposing fee payment for ${taskId}...`,
      };
    },
  },

  // 6. Complete project / Milestone submission
  // e.g. "complete cs301 design", "submit architecture spec", "submit project", "complete milestone 2"
  {
    regex: /\b(submit|complete|finish|deliver)\s+(.*?)(?:\s+project|\s+spec|\s+milestone|\s+architecture)?\s*$/i,
    handler: (_match, input) => {
      const idMatch = input.match(/\b(task-[\w-]+)\b/i);
      const taskId = idMatch?.[1] || inferProjectOrGeneralTaskId(input);
      const isProject = taskId.includes('cs301') || taskId.includes('project');
      const action = isProject ? 'submit_project' : 'mark_done';
      return {
        tool: 'propose_action',
        args: { task_id: taskId, action },
        displayIntent: `Proposing action on ${taskId}...`,
      };
    },
  },

  // 7. Mark task as done (general / explicit)
  // e.g. "mark task-bio-quiz as done", "mark physics lab as complete", "return library book"
  {
    regex: /\b(?:mark|set|update)\s+(.*?)\s+(?:as\s+)?(?:done|complete|completed|finished)\b|\breturn\s+(?:the\s+)?(?:library\s+)?book\b/i,
    handler: (match, input) => {
      const idMatch = input.match(/\b(task-[\w-]+)\b/i);
      const taskId = idMatch?.[1] || inferGeneralTaskId(input);
      return {
        tool: 'propose_action',
        args: { task_id: taskId, action: 'mark_done' },
        displayIntent: `Proposing to mark ${taskId} as done...`,
      };
    },
  },

  // 8. Specific task details
  // e.g. "get task task-cs301-impl", "details about task-fee-tuition", "show task-cs301-design"
  {
    regex: /\b(?:get|show|details?|info|explain)\s+(?:about\s+|for\s+)?(?:task\s+)?(task-[\w-]+)\b/i,
    handler: (match) => ({
      tool: 'get_task',
      args: { id: match[1] },
      displayIntent: `Looking up task ${match[1]}...`,
    }),
  },

  // 9. List tasks with filters
  // e.g. "list all tasks", "show tasks", "list open assignments", "show fees"
  {
    regex: /\b(list|show|view)\s+(?:all\s+)?(blocked|stale|open|done)?\s*(tasks?|assignments?|fees?|projects?|library)?\b/i,
    handler: (match) => {
      const args: Record<string, unknown> = {};
      const statusWord = match[2]?.toLowerCase();
      if (statusWord && ['open', 'blocked', 'done', 'stale'].includes(statusWord)) {
        args.status = statusWord;
      }
      const categoryWord = match[3]?.toLowerCase();
      if (categoryWord) {
        const catMap: Record<string, string> = {
          task: '',
          tasks: '',
          assignment: 'assignment',
          assignments: 'assignment',
          fee: 'fee',
          fees: 'fee',
          project: 'project',
          projects: 'project',
          library: 'library',
        };
        const cat = catMap[categoryWord];
        if (cat) args.category = cat;
      }
      return {
        tool: 'list_tasks',
        args,
        displayIntent: `Fetching tasks${statusWord ? ` (${statusWord})` : ''}...`,
      };
    },
  },
];

function inferFeeTaskId(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes('health') || lower.includes('insurance') || lower.includes('waiver') || lower.includes('surcharge')) {
    return 'task-fee-health';
  }
  // Default fee is tuition
  return 'task-fee-tuition';
}

function inferProjectOrGeneralTaskId(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes('dependenc') || lower.includes('design') || lower.includes('spec') || lower.includes('architecture')) {
    return 'task-cs301-design';
  }
  if (lower.includes('impl') || lower.includes('milestone') || lower.includes('code') || lower.includes('cs301')) {
    return 'task-cs301-impl';
  }
  if (lower.includes('phys') || lower.includes('quantum') || lower.includes('lab')) {
    return 'task-phys-lab2';
  }
  if (lower.includes('math') || lower.includes('240') || lower.includes('linear') || lower.includes('ps4')) {
    return 'task-math240-ps4';
  }
  if (lower.includes('lib') || lower.includes('book') || lower.includes('clrs') || lower.includes('algorithm')) {
    return 'task-lib-clrs';
  }
  if (lower.includes('bio') || lower.includes('quiz') || lower.includes('safety')) {
    return 'task-bio-quiz';
  }
  if (lower.includes('fee') || lower.includes('tuition')) {
    return inferFeeTaskId(input);
  }
  return 'task-cs301-design';
}

function inferGeneralTaskId(input: string): string {
  return inferProjectOrGeneralTaskId(input);
}

export function parseIntent(userInput: string): IntentResult {
  const trimmed = userInput.trim();
  for (const { regex, handler } of patterns) {
    const match = trimmed.match(regex);
    if (match) {
      return handler(match, trimmed);
    }
  }

  // Fallback: smart ops brief
  return {
    tool: 'get_smart_brief',
    args: {},
    displayIntent: 'Checking your academic ops status...',
  };
}
