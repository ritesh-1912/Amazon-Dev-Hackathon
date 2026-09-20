'use client';

import { Task } from '@/lib/types';

const statusConfig: Record<string, { label: string; badge: string; color: string; bg: string }> = {
  open: {
    label: 'Open',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    color: 'text-blue-400',
    bg: 'bg-[#18181b] border-neutral-800 hover:border-blue-500/40',
  },
  blocked: {
    label: 'Blocked',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    color: 'text-amber-400',
    bg: 'bg-[#18181b] border-amber-500/30 hover:border-amber-500/60 shadow-sm shadow-amber-500/5',
  },
  done: {
    label: 'Done',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    color: 'text-emerald-400',
    bg: 'bg-[#18181b] border-neutral-800/80 opacity-75 hover:opacity-100 hover:border-emerald-500/40',
  },
  stale: {
    label: 'Overdue',
    badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    color: 'text-rose-400',
    bg: 'bg-[#18181b] border-rose-500/30 hover:border-rose-500/60 shadow-sm shadow-rose-500/5',
  },
};

const categoryIcons: Record<string, string> = {
  assignment: '📝',
  fee: '💳',
  project: '🔬',
  library: '📚',
  other: '📌',
};

export default function TaskSidebar({
  tasks,
  onRefresh,
  loading,
  onSelectTask,
}: {
  tasks: Task[];
  onRefresh: () => void;
  loading: boolean;
  onSelectTask?: (task: Task) => void;
}) {
  const openCount = tasks.filter((t) => t.status === 'open').length;
  const blockedCount = tasks.filter((t) => t.status === 'blocked').length;
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const staleCount = tasks.filter((t) => t.status === 'stale').length;

  return (
    <aside className="w-84 border-l border-neutral-800 flex flex-col h-full bg-[#0d0d10]">
      {/* Header */}
      <div className="p-4 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
              Live Task Board
            </h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">
              {tasks.length}
            </span>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors flex items-center gap-1 cursor-pointer"
            title="Refresh tasks from MCP server"
          >
            <span className={loading ? 'animate-spin' : ''}>↻</span> {loading ? 'Syncing...' : 'Refresh'}
          </button>
        </div>

        {/* Status Counters */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="text-center py-2 px-1 rounded-lg bg-[#18181b] border border-neutral-800">
            <div className="text-base font-bold text-blue-400">{openCount}</div>
            <div className="text-[10px] text-neutral-400 font-medium">Open</div>
          </div>
          <div className="text-center py-2 px-1 rounded-lg bg-[#18181b] border border-amber-500/20">
            <div className="text-base font-bold text-amber-400">{blockedCount}</div>
            <div className="text-[10px] text-neutral-400 font-medium">Blocked</div>
          </div>
          <div className="text-center py-2 px-1 rounded-lg bg-[#18181b] border border-emerald-500/20">
            <div className="text-base font-bold text-emerald-400">{doneCount}</div>
            <div className="text-[10px] text-neutral-400 font-medium">Done</div>
          </div>
          <div className="text-center py-2 px-1 rounded-lg bg-[#18181b] border border-rose-500/20">
            <div className="text-base font-bold text-rose-400">{staleCount}</div>
            <div className="text-[10px] text-neutral-400 font-medium">Overdue</div>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {tasks.length === 0 && !loading && (
          <div className="text-center text-neutral-500 text-xs py-12 px-4 leading-relaxed">
            No tasks loaded.
            <br />
            Click Refresh to fetch from MCP server.
          </div>
        )}

        {tasks.map((task) => {
          const status = statusConfig[task.status] || statusConfig.open;
          return (
            <div
              key={task.id}
              onClick={() => onSelectTask?.(task)}
              className={`p-3 rounded-xl border ${status.bg} transition-all cursor-pointer group`}
            >
              {/* Top Row: Category & Badges */}
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{categoryIcons[task.category] || '📌'}</span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {task.id}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded border ${status.badge}`}
                  >
                    {status.label}
                  </span>
                  {task.action_class === 'HUMAN_REQUIRED' && (
                    <span
                      className="text-[9px] font-semibold px-1 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30"
                      title="Requires explicit human confirmation before state changes"
                    >
                      🛡️ Guard
                    </span>
                  )}
                </div>
              </div>

              {/* Title */}
              <p className="text-xs font-medium text-neutral-200 leading-snug group-hover:text-white transition-colors">
                {task.title}
              </p>

              {/* Dependencies banner if blocked */}
              {task.status === 'blocked' && task.depends_on.length > 0 && (
                <div className="mt-2 text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded px-2 py-1 flex items-center gap-1">
                  <span>⛓️</span>
                  <span>Blocked by: <strong>{task.depends_on.join(', ')}</strong></span>
                </div>
              )}

              {/* Due Date */}
              <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-500 font-mono">
                <span>
                  Due: {new Date(task.deadline).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <span className="text-neutral-600 group-hover:text-blue-400 transition-colors">
                  Ask AI →
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
