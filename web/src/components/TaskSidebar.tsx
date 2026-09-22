'use client';

import { Task } from '@/lib/types';

const statusConfig: Record<string, { label: string; badge: string; dot: string; bg: string }> = {
  open: {
    label: 'Open',
    badge: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    dot: 'bg-zinc-400',
    bg: 'bg-[#121215] border-zinc-800/80 hover:border-zinc-700',
  },
  blocked: {
    label: 'Blocked',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    dot: 'bg-amber-400',
    bg: 'bg-[#121215] border-zinc-800/80 hover:border-zinc-700',
  },
  done: {
    label: 'Done',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-400',
    bg: 'bg-[#121215] border-zinc-800/80 opacity-60 hover:opacity-100 hover:border-zinc-700',
  },
  stale: {
    label: 'Overdue',
    badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    dot: 'bg-rose-400',
    bg: 'bg-[#121215] border-zinc-800/80 hover:border-zinc-700',
  },
};

const categoryLabels: Record<string, string> = {
  assignment: 'Assignment',
  fee: 'Fee',
  project: 'Project',
  library: 'Library',
  other: 'Task',
};

export default function TaskSidebar({
  tasks,
  onRefresh,
  loading,
  connectionError,
  onSelectTask,
}: {
  tasks: Task[];
  onRefresh: () => void;
  loading: boolean;
  connectionError?: string | null;
  onSelectTask?: (task: Task) => void;
}) {
  const openCount = tasks.filter((t) => t.status === 'open').length;
  const blockedCount = tasks.filter((t) => t.status === 'blocked').length;
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const staleCount = tasks.filter((t) => t.status === 'stale').length;

  return (
    <aside className="w-80 border-l border-zinc-800 flex flex-col h-full bg-[#0c0c0e]">
      {/* Header */}
      <div className="p-3.5 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Task Board
            </h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
              {tasks.length}
            </span>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Refresh task list"
          >
            <svg
              className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span className="font-mono">{loading ? 'Syncing' : 'Refresh'}</span>
          </button>
        </div>

        {/* Status Counters */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="text-center py-2 px-1 rounded-md bg-[#121215] border border-zinc-800">
            <div className="text-base font-semibold text-zinc-200">{openCount}</div>
            <div className="text-[10px] text-zinc-500 font-medium">Open</div>
          </div>
          <div className="text-center py-2 px-1 rounded-md bg-[#121215] border border-zinc-800">
            <div className="text-base font-semibold text-amber-400">{blockedCount}</div>
            <div className="text-[10px] text-zinc-500 font-medium">Blocked</div>
          </div>
          <div className="text-center py-2 px-1 rounded-md bg-[#121215] border border-zinc-800">
            <div className="text-base font-semibold text-emerald-400">{doneCount}</div>
            <div className="text-[10px] text-zinc-500 font-medium">Done</div>
          </div>
          <div className="text-center py-2 px-1 rounded-md bg-[#121215] border border-zinc-800">
            <div className="text-base font-semibold text-rose-400">{staleCount}</div>
            <div className="text-[10px] text-zinc-500 font-medium">Overdue</div>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {connectionError && (
          <div className="p-3 rounded-md bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono leading-relaxed">
            <div className="font-semibold text-rose-200 mb-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
              <span>Connection Failed</span>
            </div>
            <p className="text-[11px] text-rose-300/80 break-words mb-2">{connectionError}</p>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="text-[11px] px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-100 border border-rose-700/60 transition-colors cursor-pointer"
            >
              Retry Sync
            </button>
          </div>
        )}

        {loading && tasks.length === 0 && (
          <div className="text-center text-zinc-500 text-xs py-12 px-4 leading-relaxed font-mono">
            Syncing task board...
          </div>
        )}

        {tasks.length === 0 && !loading && !connectionError && (
          <div className="text-center text-zinc-500 text-xs py-12 px-4 leading-relaxed font-mono">
            No tasks found.
          </div>
        )}

        {tasks.map((task) => {
          const status = statusConfig[task.status] || statusConfig.open;
          return (
            <div
              key={task.id}
              onClick={() => onSelectTask?.(task)}
              className={`p-3 rounded-lg border ${status.bg} transition-all cursor-pointer group`}
            >
              {/* Top Row: Category & Badges */}
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                  <span className="text-[10px] font-semibold text-zinc-300">
                    {categoryLabels[task.category] || 'Task'}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {task.id}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={`text-[9px] font-medium uppercase px-1.5 py-0.5 rounded border ${status.badge}`}
                  >
                    {status.label}
                  </span>
                  {task.action_class === 'HUMAN_REQUIRED' && (
                    <span
                      className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700"
                      title="Requires operator confirmation before state mutation"
                    >
                      GUARD
                    </span>
                  )}
                </div>
              </div>

              {/* Title */}
              <p className="text-xs font-medium text-zinc-200 leading-snug group-hover:text-white transition-colors">
                {task.title}
              </p>

              {/* Dependencies banner if blocked */}
              {task.status === 'blocked' && task.depends_on.length > 0 && (
                <div className="mt-2 text-[10px] bg-zinc-900 text-zinc-300 border border-zinc-800 rounded px-2 py-1 flex items-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  <span>Prerequisite: <strong>{task.depends_on.join(', ')}</strong></span>
                </div>
              )}

              {/* Due Date */}
              <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                <span>
                  Due: {new Date(task.deadline).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <span className="text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  Details
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
