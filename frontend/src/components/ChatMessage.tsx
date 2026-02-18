import React from 'react';
import { Clock, User, Sparkles, FileText, Image as ImageIcon } from 'lucide-react';

interface FileAttachment {
  name: string;
  type: string;
  size: number;
}

interface ChatAction {
  label: string;
  onClick: () => void;
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  file?: FileAttachment;
  actions?: ChatAction[];
  isProcessing?: boolean;
  processingLabel?: string;
}

/**
 * Renders markdown-like content into React elements.
 * Supports: **bold**, bullet points (- ), numbered lists, and line breaks.
 */
function renderContent(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const ListTag = listType === 'ul' ? 'ul' : 'ol';
      elements.push(
        <ListTag key={`list-${elements.length}`} className={`${listType === 'ul' ? 'list-disc' : 'list-decimal'} ml-4 space-y-1`}>
          {listItems}
        </ListTag>
      );
      listItems = [];
      listType = null;
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    // Bullet point: - or *
    if (/^[-•]\s+/.test(trimmed)) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(<li key={`li-${i}`} className="text-sm leading-relaxed">{formatInline(trimmed.replace(/^[-•]\s+/, ''))}</li>);
      return;
    }

    // Numbered list: 1. or 1)
    if (/^\d+[.)\s]/.test(trimmed)) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(<li key={`li-${i}`} className="text-sm leading-relaxed">{formatInline(trimmed.replace(/^\d+[.)\s]+/, ''))}</li>);
      return;
    }

    // Regular text line
    flushList();
    if (trimmed === '') {
      elements.push(<div key={`br-${i}`} className="h-2" />);
    } else {
      elements.push(<p key={`p-${i}`} className="text-sm leading-relaxed">{formatInline(trimmed)}</p>);
    }
  });

  flushList();
  return elements;
}

/** Format inline markdown: **bold** and *italic* */
function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(<strong key={match.index} className="font-semibold">{match[1]}</strong>);
    } else if (match[2]) {
      parts.push(<em key={match.index}>{match[2]}</em>);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function getFileTypeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/png')) return 'PNG';
  if (mimeType.startsWith('image/jpeg') || mimeType.startsWith('image/jpg')) return 'JPG';
  if (mimeType.startsWith('image/webp')) return 'WebP';
  if (mimeType.startsWith('image/')) return 'Image';
  return 'File';
}

/** File attachment card - styled like the ChatGPT reference */
function FileCard({ file }: { file: FileAttachment }) {
  const isPdf = file.type === 'application/pdf';
  const isImage = file.type.startsWith('image/');
  const typeLabel = getFileTypeLabel(file.type);

  return (
    <div className="flex items-center gap-3 bg-gray-800 dark:bg-[#2A2D32] border border-gray-700 dark:border-[#3A3D42] rounded-xl px-3 py-2.5 mb-2 max-w-[280px]">
      {/* File icon */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
        isPdf ? 'bg-red-500' : isImage ? 'bg-purple-500' : 'bg-gray-500'
      }`}>
        {isPdf ? (
          <FileText className="w-5 h-5 text-white" />
        ) : isImage ? (
          <ImageIcon className="w-5 h-5 text-white" />
        ) : (
          <FileText className="w-5 h-5 text-white" />
        )}
      </div>
      {/* File info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-gray-100">{file.name}</p>
        <p className="text-xs text-gray-400">{typeLabel} · {formatFileSize(file.size)}</p>
      </div>
    </div>
  );
}

/** Processing indicator for "Reading document..." */
function ProcessingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-sm text-gray-500 dark:text-gray-400 italic">{label || 'Thinking...'}</span>
    </div>
  );
}

export default function ChatMessage({ role, content, timestamp, file, actions, isProcessing, processingLabel }: ChatMessageProps) {
  const isUser = role === 'user';
  const timeAgo = formatTimeAgo(timestamp);

  // Processing state: show typing indicator
  if (isProcessing) {
    return (
      <div className="flex gap-3 mb-4 flex-row">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 max-w-[85%]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">NeoBright AI</span>
          </div>
          <div className="rounded-2xl bg-gray-100 dark:bg-[#2A2D32] rounded-bl-sm">
            <ProcessingIndicator label={processingLabel} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      )}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
      )}

      {/* Message Content */}
      <div className={`flex-1 max-w-[85%] ${isUser ? 'flex flex-col items-end' : ''}`}>
        {/* Assistant label */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">NeoBright AI</span>
          </div>
        )}

        {/* File card (shown above message bubble for user messages) */}
        {isUser && file && (
          <FileCard file={file} />
        )}

        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-blue-600 text-white rounded-br-sm'
              : 'bg-gray-100 dark:bg-[#2A2D32] text-gray-800 dark:text-gray-100 rounded-bl-sm'
          }`}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed">{content}</p>
          ) : (
            <div className="space-y-1">{renderContent(content)}</div>
          )}
        </div>

        {/* Action Buttons - outline style */}
        {actions && actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {actions.map((action, idx) => (
              <button
                key={idx}
                onClick={action.onClick}
                className="px-4 py-1.5 bg-white dark:bg-[#1A1C20] border border-gray-300 dark:border-[#3A3D42] text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-[#2A2D32] transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div className={`flex items-center gap-1 mt-1.5 text-xs text-gray-400 dark:text-gray-500 ${isUser ? 'justify-end' : 'justify-start'}`}>
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
