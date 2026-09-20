'use client';

import ReactMarkdown from 'react-markdown';
import { ChatMessage } from '@/lib/types';

export default function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      className={`animate-fade-in-up flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-zinc-800 border border-zinc-700/70 text-zinc-100 rounded-br-sm'
            : isSystem
              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-bl-sm'
              : 'bg-[#121215] border border-zinc-800 text-zinc-200 rounded-bl-sm'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-zinc-800/80">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isSystem ? 'bg-amber-400' : 'bg-zinc-400'}`}
            />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              {isSystem ? 'System Event' : 'Campus Ops'}
            </span>
          </div>
        )}

        {isUser ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </div>
        ) : (
          <div className="text-sm leading-relaxed prose prose-invert max-w-none text-zinc-200">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
                em: ({ children }) => <em className="text-zinc-300 italic">{children}</em>,
                ul: ({ children }) => <ul className="my-2 space-y-1 list-disc list-inside">{children}</ul>,
                ol: ({ children }) => <ol className="my-2 space-y-1 list-decimal list-inside">{children}</ol>,
                li: ({ children }) => <li className="leading-snug text-zinc-300">{children}</li>,
                h3: ({ children }) => <h3 className="text-sm font-semibold text-zinc-100 mt-2 mb-1">{children}</h3>,
                h4: ({ children }) => <h4 className="text-xs font-semibold text-zinc-200 mt-1.5 mb-1">{children}</h4>,
                blockquote: ({ children }) => (
                  <blockquote className="my-2 border-l-2 border-amber-500/80 bg-zinc-900/60 pl-3 py-1.5 rounded-r text-xs text-zinc-300 not-italic">
                    {children}
                  </blockquote>
                ),
                code: ({ children }) => (
                  <code className="font-mono text-[12px] bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-200">
                    {children}
                  </code>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        <div className="text-[10px] mt-2 text-zinc-500 font-mono">
          {message.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4 animate-fade-in-up">
      <div className="bg-[#121215] border border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-zinc-800/80">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Campus Ops
          </span>
        </div>
        <div className="flex gap-1.5 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 typing-dot" />
        </div>
      </div>
    </div>
  );
}
