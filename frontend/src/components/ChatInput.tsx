import React, { useState, useRef, useEffect } from 'react';
import { Send, AlertCircle, Loader2 } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => Promise<void>;
  isLoading: boolean;
  isRateLimited: boolean;
  rateLimitMessage?: string;
  placeholder?: string;
}

export default function ChatInput({
  onSend,
  isLoading,
  isRateLimited,
  rateLimitMessage,
  placeholder = 'Ask about your course...'
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [message]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) return;
    if (isLoading || isRateLimited) return;

    setError(null);

    try {
      await onSend(message.trim());
      setMessage('');
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-[#2A2D32] p-4 bg-white dark:bg-[#1A1C20]">
      {/* Error Message */}
      {error && (
        <div className="mb-3 flex items-center gap-2 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-2 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Rate Limit Warning */}
      {isRateLimited && rateLimitMessage && (
        <div className="mb-3 flex items-center gap-2 text-xs bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 p-2 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{rateLimitMessage}</span>
        </div>
      )}

      {/* Input Container */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            // Send on Enter, but allow Shift+Enter for new line
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder={placeholder}
          disabled={isLoading || isRateLimited}
          className="flex-1 px-3 py-2 bg-gray-50 dark:bg-[#2A2D32] border border-gray-200 dark:border-[#3A3D42] rounded-lg text-sm resize-none focus:outline-none focus:border-blue-500 dark:focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
          rows={1}
        />
        <button
          type="submit"
          disabled={!message.trim() || isLoading || isRateLimited}
          className="flex-shrink-0 w-10 h-10 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-lg flex items-center justify-center transition-colors disabled:cursor-not-allowed"
          title={isRateLimited ? 'Rate limited - please wait' : 'Send message'}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Helper Text */}
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
        Press Enter to send, Shift+Enter for new line
      </p>
    </form>
  );
}
