'use client';

import { ChatMessage } from '@/lib/types';

export default function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      className={`animate-fade-in-up flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-[var(--accent)] text-white rounded-br-md'
            : isSystem
              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-bl-md'
              : 'bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] rounded-bl-md'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-[var(--accent)]">
              {isSystem ? '⚙️ System' : '🎓 Campus Ops'}
            </span>
          </div>
        )}
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
        <div className={`text-[10px] mt-1.5 ${isUser ? 'text-blue-200' : 'text-[var(--muted)]'}`}>
          {message.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4 animate-fade-in-up">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-[var(--accent)]">🎓 Campus Ops</span>
        </div>
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[var(--muted)] typing-dot" />
          <div className="w-2 h-2 rounded-full bg-[var(--muted)] typing-dot" />
          <div className="w-2 h-2 rounded-full bg-[var(--muted)] typing-dot" />
        </div>
      </div>
    </div>
  );
}
