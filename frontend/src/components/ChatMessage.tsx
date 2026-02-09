import React from 'react';
import { Clock, User, Brain } from 'lucide-react';

interface ChatAction {
  label: string;
  onClick: () => void;
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: ChatAction[];
}

export default function ChatMessage({ role, content, timestamp, actions }: ChatMessageProps) {
  const isUser = role === 'user';
  const timeAgo = formatTimeAgo(timestamp);

  return (
    <div className={`flex gap-3 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-blue-100 dark:bg-blue-900/30'
            : 'bg-gradient-to-br from-purple-400 to-blue-500'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        ) : (
          <Brain className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-xs lg:max-w-md`}>
        <div
          className={`rounded-lg px-4 py-2.5 ${
            isUser
              ? 'bg-blue-500 text-white rounded-br-none'
              : 'bg-gray-100 dark:bg-[#2A2D32] text-gray-900 dark:text-white rounded-bl-none'
          }`}
        >
          <p className="text-sm leading-relaxed">{content}</p>
        </div>

        {/* Action Buttons */}
        {actions && actions.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {actions.map((action, idx) => (
              <button
                key={idx}
                onClick={action.onClick}
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors text-left"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div className={`flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-400 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <Clock className="w-3 h-3" />
          <span>{timeAgo}</span>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}
