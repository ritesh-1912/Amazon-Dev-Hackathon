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
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status}: Can't reach the MCP server — check MCP_SERVER_URL`);
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || `HTTP ${res.status}: Can't reach the MCP server — check MCP_SERVER_URL`);
  }
  if (data.result?.isError) {
    const errorMsg = data.result.content?.[0]?.text || "Can't reach the MCP server — check MCP_SERVER_URL";
    throw new Error(errorMsg);
  }
  return data.result;
}

function extractTextFromResult(result: any): string {
  if (!result?.content) return 'No response received from tool.';
  return result.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n');
}

function formatToolResponse(tool: string, rawText: string): string {
  try {
    const parsed = JSON.parse(rawText);

    if (tool === 'list_tasks' && Array.isArray(parsed)) {
      if (parsed.length === 0) return 'No matching tasks.';
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
      return `### Task: ${t.title}\n\n- **ID**: \`${t.id}\`\n- **Category**: ${t.category}\n- **Status**: ${t.status.toUpperCase()}\n- **Action Class**: ${guardTag}\n- **Deadline**: ${new Date(t.deadline).toLocaleString()}\n- **Dependencies**: ${t.depends_on?.length ? t.depends_on.join(', ') : 'None'}`;
    }

    if (tool === 'confirm_action' && parsed.confirmed !== undefined) {
      if (parsed.confirmed) {
        return `**Action Confirmed**\n\nTask \`${parsed.task_id}\` marked as DONE. Recorded in audit log.`;
      } else {
        return `**Action Cancelled**\n\nTask \`${parsed.task_id}\` unchanged. Recorded in audit log.`;
      }
    }

    if (tool === 'get_smart_brief' || tool === 'get_weekly_brief') {
      if (typeof parsed === 'string') return parsed;
      if (parsed.summary) return parsed.summary;
      let out = '### Operations Brief\n\n';
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
        '**Campus Ops System Online**\n\nAcademic operations engine active. Monitored records: assignments, fees, dependencies, loans.\n\nCommands:\n- **"What\'s due this week?"** — Operational summary\n- **"What\'s blocked?"** — Dependency check\n- **"Complete CS 301 design"** — Resolve prerequisite\n- **"Pay tuition fee"** — Guarded mutation',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
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
  const refreshTasks = useCallback(async (retryCount = 0) => {
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
        setConnectionError(null);
        setIsInitialLoad(false);
        return;
      }
    } catch (err: any) {
      console.error('Failed to load tasks:', err);
      setConnectionError(err?.message || "Can't reach the MCP server — check MCP_SERVER_URL");
      // If initial fetch failed, retry once after 3s (handles backend cold-start)
      if (retryCount === 0) {
        setTimeout(() => refreshTasks(1), 3000);
      }
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
      setConnectionError(null);
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
            content: `**Confirmation Required**\n\nAuthorization required for state mutation:\n\n> **Task**: ${taskTitle} (\`${taskId}\`)\n> **Action**: \`${action}\`\n> **Reason**: ${parsed.reason}\n\nConfirm or cancel in dialog.`,
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
            note: 'Auto action executed.',
          });
          setConnectionError(null);
          const confirmText = extractTextFromResult(confirmRes);
          const formatted = formatToolResponse('confirm_action', confirmText);
          addMessage({
            role: 'assistant',
            content: `**Auto Action Executed**\n\n${formatted}`,
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
      if (err?.message?.includes('MCP') || err?.message?.includes('reach') || err?.message?.includes('check MCP_SERVER_URL')) {
        setConnectionError(err.message);
      }
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
        note: 'Confirmed by operator.',
      });
      setConnectionError(null);
      const rawText = extractTextFromResult(result);
      const formatted = formatToolResponse('confirm_action', rawText);
      addMessage({ role: 'assistant', content: formatted });
      await refreshTasks();
    } catch (err: any) {
      if (err?.message?.includes('MCP') || err?.message?.includes('reach') || err?.message?.includes('check MCP_SERVER_URL')) {
        setConnectionError(err.message);
      }
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
        note: 'Cancelled by operator.',
      });
      setConnectionError(null);
      const rawText = extractTextFromResult(result);
      const formatted = formatToolResponse('confirm_action', rawText);
      addMessage({ role: 'assistant', content: formatted });
      await refreshTasks();
    } catch (err: any) {
      if (err?.message?.includes('MCP') || err?.message?.includes('reach') || err?.message?.includes('check MCP_SERVER_URL')) {
        setConnectionError(err.message);
      }
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
        <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-[#0c0c0e]/95 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-zinc-200">
              <span className="text-xs font-mono font-semibold">CO</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs font-semibold text-zinc-100 tracking-tight">Campus Ops</h1>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/90 text-zinc-400 border border-zinc-700 font-mono">
                  Alexa+ Simulator
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">Streamable HTTP MCP · AWS Bedrock (Claude) · SQLite</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  connectionError
                    ? 'bg-rose-500'
                    : isInitialLoad && tasksLoading
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-emerald-500'
                }`}
              />
              <span className="text-xs text-zinc-400 font-mono">
                {connectionError
                  ? 'MCP Offline'
                  : isInitialLoad && tasksLoading
                    ? 'Waking Server...'
                    : 'MCP Connected'}
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
            >
              {sidebarOpen ? 'Hide Board' : 'Show Board'}
            </button>
          </div>
        </header>

        {/* Connection Failure Banner */}
        {connectionError && (
          <div className="px-6 py-2.5 bg-rose-950/40 border-b border-rose-900/60 flex items-center justify-between gap-4 text-xs font-mono text-rose-300">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 animate-pulse" />
              <span className="truncate">
                Can&apos;t reach the MCP server — check MCP_SERVER_URL
              </span>
              <span className="hidden md:inline text-[11px] text-rose-400/70 truncate">
                ({connectionError})
              </span>
            </div>
            <button
              onClick={() => refreshTasks()}
              disabled={tasksLoading}
              className="px-2.5 py-1 rounded bg-rose-900/50 hover:bg-rose-800/80 text-rose-200 border border-rose-700/60 text-xs whitespace-nowrap transition-colors cursor-pointer flex-shrink-0"
            >
              {tasksLoading ? 'Connecting...' : 'Retry'}
            </button>
          </div>
        )}

        {/* Cold-start Loading Banner */}
        {isInitialLoad && tasksLoading && !connectionError && (
          <div className="px-6 py-2.5 bg-zinc-900/70 border-b border-zinc-800 flex items-center gap-2.5 text-xs font-mono text-zinc-300">
            <div className="w-3.5 h-3.5 border-2 border-zinc-500 border-t-amber-400 rounded-full animate-spin flex-shrink-0" />
            <span>
              Waking up the MCP server (this can take up to 30s on first load)...
            </span>
          </div>
        )}

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          {isLoading && (
            <TypingIndicator
              text={
                isInitialLoad
                  ? 'Waking up the MCP server (this can take up to 30s on first load)...'
                  : undefined
              }
            />
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Demo Workflow Quick Steps */}
        <div className="px-6 py-2 border-t border-zinc-800/60 bg-[#0c0c0e]/60 flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[11px] text-zinc-500 font-medium whitespace-nowrap">
            Workflow:
          </span>
          {demoSteps.map((ds) => (
            <button
              key={ds.step}
              onClick={() => handleSend(ds.prompt)}
              disabled={isLoading}
              className="text-xs px-2.5 py-1 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800/80 transition-colors whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <span className="w-3.5 h-3.5 rounded bg-zinc-800 text-[10px] text-zinc-500 flex items-center justify-center font-mono font-medium">
                {ds.step}
              </span>
              <span>{ds.label}</span>
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-zinc-800 bg-[#0c0c0e]/95">
          <div className="flex items-center gap-3 bg-[#121215] border border-zinc-800 rounded-lg px-3.5 py-2 focus-within:border-zinc-600 transition-colors">
            <svg
              className="w-4 h-4 text-zinc-500 flex-shrink-0"
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
              placeholder="Enter command (e.g. 'What is due this week', 'Complete dependency', 'Mark fees paid')..."
              className="flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 outline-none"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !inputValue.trim()}
              className="px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium disabled:opacity-30 disabled:hover:bg-zinc-100 transition-colors cursor-pointer"
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
          connectionError={connectionError}
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
