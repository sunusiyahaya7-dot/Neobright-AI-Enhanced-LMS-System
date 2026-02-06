import React, { useEffect, useState, useRef } from 'react';
import { X, ChevronDown, Sparkles, BookOpen, BarChart3, Clock, AlertCircle, Loader2 } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { aiChatService, ChatSession, ChatMessage as IChatMessage } from '../services/aiChatService';

const QUICK_ACTIONS = [
  { label: 'Summarize This Topic', icon: BookOpen },
  { label: 'Quiz Me on This', icon: BarChart3 },
  { label: "What's Due Soon?", icon: Clock },
  { label: 'Show My Progress', icon: BarChart3 }
];

interface AIChatPanelProps {
  courseId?: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function AIChatPanel({ courseId, isOpen, onClose }: AIChatPanelProps) {
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<IChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load or create chat session on mount
  useEffect(() => {
    const initChat = async () => {
      try {
        setLoading(true);
        setError(null);

        // Check for cached chat ID
        const cachedChatId = localStorage.getItem('activeChatId');

        if (cachedChatId) {
          // Load existing chat
          const chat = await aiChatService.getChat(cachedChatId);
          setChatSession(chat);
          setMessages(chat.messages || []);
        } else {
          // Create new chat
          const newChat = await aiChatService.createChat({
            courseId,
            title: 'Dashboard Chat'
          });
          setChatSession(newChat);
          setMessages([]);
          localStorage.setItem('activeChatId', newChat.chatId);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load chat');
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      initChat();
    }
  }, [isOpen, courseId]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Rate limit countdown
  useEffect(() => {
    if (!isRateLimited) return;

    const interval = setInterval(() => {
      setRateLimitCountdown((prev) => {
        if (prev <= 1) {
          setIsRateLimited(false);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRateLimited]);

  const handleSendMessage = async (userMessage: string) => {
    if (!chatSession) return;

    try {
      setSendingMessage(true);
      setError(null);
      setShowQuickActions(false);

      // Optimistically add user message
      const userMsg: IChatMessage = {
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString()
      };
      setMessages((prev) => [...prev, userMsg]);

      // Send to backend
      const response = await aiChatService.sendMessage(chatSession.chatId, userMessage);

      // Add assistant message
      setMessages((prev) => [...prev, response.assistantMessage]);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err.message || 'Failed to send message';

      // Check if rate limited
      if (err?.response?.status === 429) {
        setIsRateLimited(true);
        setRateLimitCountdown(60); // Assume 60 seconds default
        setError('Rate limit exceeded. Please wait before sending another message.');
      } else {
        setError(errorMsg);
      }

      // Remove optimistic user message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSendingMessage(false);
    }
  };

  const handleQuickAction = (action: string) => {
    handleSendMessage(action);
  };

  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 w-full max-w-sm h-96 bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl shadow-2xl flex flex-col z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#2A2D32] bg-gradient-to-r from-blue-500 to-blue-600 rounded-t-xl text-white">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">NeoBright AI</h3>
            <p className="text-xs text-white/80">Ask questions about your courses</p>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-white/20 rounded-lg transition-colors"
          title="Close chat"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : error && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <Sparkles className="w-8 h-8 text-blue-500" />
            <p className="text-sm font-medium text-gray-900 dark:text-white">No messages yet</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">Send a message to get started</p>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <ChatMessage
                key={idx}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Quick Actions */}
      {showQuickActions && messages.length === 0 && !loading && (
        <div className="px-4 pb-3 border-b border-gray-200 dark:border-[#2A2D32]">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-medium">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((action) => {
              const IconComponent = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.label)}
                  disabled={sendingMessage || isRateLimited}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-[#2A2D32] hover:bg-gray-100 dark:hover:bg-[#3A3D42] border border-gray-200 dark:border-[#3A3D42] rounded-lg text-xs text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={action.label}
                >
                  <IconComponent className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSendMessage}
        isLoading={sendingMessage}
        isRateLimited={isRateLimited}
        rateLimitMessage={
          isRateLimited && rateLimitCountdown > 0
            ? `Please wait ${rateLimitCountdown}s before sending another message`
            : undefined
        }
      />
    </div>
  );
}
