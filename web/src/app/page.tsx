'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ChatBubble, { TypingIndicator } from '@/components/ChatBubble';
import TaskSidebar from '@/components/TaskSidebar';
import ConfirmationModal from '@/components/ConfirmationModal';
import { parseIntent } from '@/lib/intent-router';
import { ChatMessage, Task } from '@/lib/types';

interface PendingConfirmation {
  taskId: string;
  taskTitle: string;
  action: string;
}

async function callMcpTool(tool: string, args: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch('/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

function extractTextFromResult(result: any): string {
  if (!result?.content) return 'No response from MCP tool';
  return result.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n');
}

function formatToolResponse(tool: string, rawText: string): string {
  try {
    const parsed = JSON.parse(rawText);

    if (tool === 'list_tasks' && Array.isArray(parsed)) {
      if (parsed.length === 0) return 'No tasks found matching that filter.';
      return parsed
        .map((t: any) => {
          const statusTag = `[${t.status.toUpperCase()}]`;
          const guardTag = t.action_class === 'HUMAN_REQUIRED' ? '[GUARDED]' : '[AUTO]';
          let depText = '';
          if (t.depends_on && t.depends_on.length > 0) {
            depText = `\n   Prerequisites: \`${t.depends_on.join(', ')}\``;
          }
          return `* ${statusTag} **${t.title}** ${guardTag}\n   ID: \`${t.id}\` | Due: ${new Date(t.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${depText}`;
        })
        .join('\n\n');
    }

    if (tool === 'get_task' && parsed.id) {
      const t = parsed;
      const guardTag = t.action_class === 'HUMAN_REQUIRED' ? 'HUMAN_REQUIRED (Guarded)' : 'AUTO';
      return `### Task Details: ${t.title}\n\n- **ID**: \`${t.id}\`\n- **Category**: ${t.category}\n- **Status**: ${t.status.toUpperCase()}\n- **Action Class**: ${guardTag}\n- **Deadline**: ${new Date(t.deadline).toLocaleString()}\n- **Dependencies**: ${t.depends_on?.length ? t.depends_on.join(', ') : 'None'}`;
    }

    if (tool === 'confirm_action' && parsed.confirmed !== undefined) {
      if (parsed.confirmed) {
        return `**Action Confirmed & Executed**\n\n${parsed.message || 'Task state updated.'}\n\nTask \`${parsed.task_id}\` status updated to **DONE**. Recorded in audit trail.`;
      } else {
        return `**Action Cancelled**\n\n${parsed.message || 'Task state was left unchanged.'}\n\nNo modifications applied to task \`${parsed.task_id}\`. Recorded rejection in audit trail.`;
      }
    }

    if (tool === 'get_smart_brief' || tool === 'get_weekly_brief') {
      if (typeof parsed === 'string') return parsed;
      if (parsed.summary) return parsed.summary;
      let out = '### Weekly Academic Ops Brief\n\n';
      if (parsed.open_tasks?.length) {
        out += `**Open Tasks (${parsed.open_tasks.length})**:\n${parsed.open_tasks.map((t: any) => `- **${t.title}** — due ${new Date(t.deadline).toLocaleDateString()}`).join('\n')}\n\n`;
      }
      if (parsed.blocked_tasks?.length) {
        out += `**Blocked Tasks (${parsed.blocked_tasks.length})**:\n${parsed.blocked_tasks.map((t: any) => `- **${t.title}** — blocked by prerequisite: \`${t.blocked_by?.join(', ')}\``).join('\n')}\n\n`;
      }
      if (parsed.stale_tasks?.length) {
        out += `**Overdue Tasks (${parsed.stale_tasks.length})**:\n${parsed.stale_tasks.map((t: any) => `- **${t.title}** — ${t.days_overdue} days past deadline`).join('\n')}\n\n`;
      }
      if (parsed.done_tasks?.length) {
        out += `**Completed Tasks (${parsed.done_tasks.length})**:\n${parsed.done_tasks.map((t: any) => `- **${t.title}**`).join('\n')}\n\n`;
      }
      return out.trim();
    }

    return rawText;
  } catch {
    return rawText;
  }
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Welcome to **Campus Ops** — your academic operations assistant powered by Alexa+ and AWS Bedrock.\n\nI monitor your course assignments, tuition fees, project dependencies, and library loans. I keep you informed of upcoming deadlines and protect real-world mutations with human confirmation gates.\n\nAsk a question or click a workflow step below:\n- **"What\'s due this week?"** (Bedrock Smart Brief)\n- **"What\'s blocked?"** (Dependency check)\n- **"Complete CS 301 design"** (Resolve prerequisite)\n- **"Pay tuition fee"** (Human-guarded action)',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Refresh tasks list from MCP server
  const refreshTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const result = await callMcpTool('list_tasks', {});
      const text = extractTextFromResult(result);
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        setTasks(
          parsed.map((t: any) => ({
            id: t.id,
            title: t.title,
            category: t.category || 'other',
            deadline: t.deadline,
            depends_on: t.depends_on || [],
            status: t.status,
            action_class: t.action_class || 'AUTO',
            audit_log: t.audit_log || [],
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  // Fetch tasks on initial mount
  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMsg: ChatMessage = {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMsg]);
    return newMsg;
  }, []);

  const handleSend = useCallback(async (customText?: string) => {
    const text = (customText ?? inputValue).trim();
    if (!text || isLoading) return;

    if (!customText) setInputValue('');
    addMessage({ role: 'user', content: text });
    setIsLoading(true);

    try {
      const intent = parseIntent(text);

      // Call MCP tool via server proxy
      const result = await callMcpTool(intent.tool, intent.args);
      const rawText = extractTextFromResult(result);

      // Check if this was a propose_action call
      try {
        const parsed = JSON.parse(rawText);

        // Guarded action requiring explicit human confirmation
        if (parsed.requires_confirmation === true) {
          const taskId = parsed.task_id || (intent.args.task_id as string);
          const taskTitle = parsed.task_title || parsed.task_id || 'Unknown task';
          const action = parsed.action || (intent.args.action as string) || 'mark_done';

          setPendingConfirmation({
            taskId,
            taskTitle,
            action,
          });

          addMessage({
            role: 'assistant',
            content: `**Action Requires Confirmation**\n\nExplicit authorization required before mutating state:\n\n> **Task**: ${taskTitle} (\`${taskId}\`)\n> **Action**: \`${action}\`\n> **Reason**: ${parsed.reason}\n\nPlease confirm or cancel via the prompt dialog.`,
          });

          await refreshTasks();
          return;
        }

        // AUTO action (no confirmation required): execute immediately
        if (parsed.requires_confirmation === false && parsed.task_id) {
          const confirmRes = await callMcpTool('confirm_action', {
            task_id: parsed.task_id,
            action: parsed.action,
            confirmed: true,
            note: 'Auto action completed via voice assistant.',
          });
          const confirmText = extractTextFromResult(confirmRes);
          const formatted = formatToolResponse('confirm_action', confirmText);
          addMessage({
            role: 'assistant',
            content: `**Executed Auto Action**\n\n${formatted}`,
          });
          await refreshTasks();
          return;
        }
      } catch {
        // Not a proposal JSON, proceed with normal format
      }

      // Display formatted output
      const formatted = formatToolResponse(intent.tool, rawText);
      addMessage({ role: 'assistant', content: formatted });

      // Refresh sidebar state
      await refreshTasks();
    } catch (err: any) {
      addMessage({
        role: 'system',
        content: `Error: ${err.message}`,
      });
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [inputValue, isLoading, addMessage, refreshTasks]);

  // Handle modal confirmation
  const handleConfirm = useCallback(async () => {
    if (!pendingConfirmation) return;

    const { taskId, action } = pendingConfirmation;
    setPendingConfirmation(null);
    setIsLoading(true);

    try {
      const result = await callMcpTool('confirm_action', {
        task_id: taskId,
        action,
        confirmed: true,
        note: 'Confirmed by student in Alexa+ simulator dialog.',
      });
      const rawText = extractTextFromResult(result);
      const formatted = formatToolResponse('confirm_action', rawText);
      addMessage({ role: 'assistant', content: formatted });
      await refreshTasks();
    } catch (err: any) {
      addMessage({
        role: 'system',
        content: `Confirmation failed: ${err.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [pendingConfirmation, addMessage, refreshTasks]);

  // Handle modal cancellation
  const handleCancel = useCallback(async () => {
    if (!pendingConfirmation) return;

    const { taskId, action } = pendingConfirmation;
    setPendingConfirmation(null);
    setIsLoading(true);

    try {
      const result = await callMcpTool('confirm_action', {
        task_id: taskId,
        action,
        confirmed: false,
        note: 'Cancelled by student in Alexa+ simulator dialog.',
      });
      const rawText = extractTextFromResult(result);
      const formatted = formatToolResponse('confirm_action', rawText);
      addMessage({ role: 'assistant', content: formatted });
      await refreshTasks();
    } catch (err: any) {
      addMessage({
        role: 'system',
        content: `Cancellation failed: ${err.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [pendingConfirmation, addMessage, refreshTasks]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Demo user story workflow buttons
  const demoSteps = [
    { step: '1', label: "What's due?", prompt: "What's due this week?" },
    { step: '2', label: 'Check blocked', prompt: 'What tasks are blocked?' },
    { step: '3', label: 'Complete dependency', prompt: 'Complete CS 301 design specification' },
    { step: '4', label: 'Verify unblocked', prompt: 'What tasks are blocked now?' },
    { step: '5', label: 'Pay tuition', prompt: 'Mark fees paid' },
  ];

  return (
    <div className="flex h-screen bg-[#09090b] text-neutral-100 overflow-hidden font-sans">
      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-neutral-800 bg-[#0d0d10]/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <span className="text-base font-bold">A+</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-white tracking-tight">Campus Ops MCP</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                  Alexa+ Voice Simulator
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">Streamable HTTP MCP · AWS Bedrock (Claude) · SQLite</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-neutral-800/80 border border-neutral-700/60">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-neutral-300 font-mono">MCP Connected</span>
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-xs text-neutral-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:border-neutral-700 transition-all cursor-pointer"
            >
              {sidebarOpen ? 'Hide Panel' : 'Show Board'}
            </button>
          </div>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Demo Workflow Quick Steps */}
        <div className="px-6 py-2 border-t border-neutral-800/50 bg-[#0d0d10]/40 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] text-neutral-500 font-medium whitespace-nowrap">
            User Story Flow:
          </span>
          {demoSteps.map((ds) => (
            <button
              key={ds.step}
              onClick={() => handleSend(ds.prompt)}
              disabled={isLoading}
              className="text-xs px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900/90 text-neutral-300 hover:text-white hover:border-blue-500/50 hover:bg-blue-600/10 transition-all whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <span className="w-4 h-4 rounded-full bg-neutral-800 text-[10px] text-neutral-400 flex items-center justify-center font-bold">
                {ds.step}
              </span>
              <span>{ds.label}</span>
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-neutral-800 bg-[#0d0d10]/90">
          <div className="flex items-center gap-3 bg-[#18181b] border border-neutral-700/80 rounded-2xl px-4 py-2.5 focus-within:border-blue-500 shadow-lg shadow-black/40 transition-colors">
            <svg
              className="w-4 h-4 text-neutral-500 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Alexa+ (e.g. 'What's due this week?', 'Complete dependency', 'Mark fees paid')..."
              className="flex-1 bg-transparent text-sm text-white placeholder:text-neutral-500 outline-none"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !inputValue.trim()}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-40 disabled:hover:bg-blue-600 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Live Task Board Sidebar */}
      {sidebarOpen && (
        <TaskSidebar
          tasks={tasks}
          onRefresh={refreshTasks}
          loading={tasksLoading}
          onSelectTask={(task) => {
            const prompt = `Show details for ${task.id}`;
            setInputValue(prompt);
            inputRef.current?.focus();
          }}
        />
      )}

      {/* Human Confirmation Modal */}
      {pendingConfirmation && (
        <ConfirmationModal
          taskTitle={pendingConfirmation.taskTitle}
          action={pendingConfirmation.action}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
