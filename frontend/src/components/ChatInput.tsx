import React, { useState, useRef, useEffect } from 'react';import { Send, AlertCircle, Loader2, Upload, X } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string, file?: File) => Promise<void>;
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [message]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type (PDFs and images for lecture notes)
      const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setError('Please upload a PDF or image file (PNG, JPG, WebP)');
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      
      setSelectedFile(file);
      setError(null);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim() && !selectedFile) return;
    if (isLoading || isRateLimited) return;

    setError(null);

    try {
      await onSend(message.trim() || 'Summarize this lecture', selectedFile || undefined);
      setMessage('');
      removeFile();
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

      {/* File Preview */}
      {selectedFile && (
        <div className="mb-3 flex items-center justify-between gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 p-3 rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p className="text-sm text-blue-900 dark:text-blue-200 truncate">{selectedFile.name}</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 flex-shrink-0">({(selectedFile.size / 1024).toFixed(1)}KB)</p>
          </div>
          <button
            type="button"
            onClick={removeFile}
            className="p-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </button>
        </div>
      )}

      {/* Input Container */}
      <div className="flex gap-2">
        {/* File Upload Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || isRateLimited}
          className="flex-shrink-0 w-10 h-10 bg-gray-200 hover:bg-gray-300 dark:bg-[#2A2D32] dark:hover:bg-[#3A3D42] disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 rounded-lg flex items-center justify-center transition-colors"
          title="Upload lecture notes (PDF or image)"
        >
          <Upload className="w-5 h-5" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/png,image/jpeg,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />

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
          disabled={!message.trim() && !selectedFile || isLoading || isRateLimited}
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
        Press Enter to send, Shift+Enter for new line. Upload lecture notes for summarization.
      </p>
    </form>
  );
}
