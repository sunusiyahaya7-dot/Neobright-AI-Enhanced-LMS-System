import React, { useEffect, useState, useRef } from 'react';
import { X, ChevronDown, Sparkles, BookOpen, BarChart3, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { aiChatService, ChatSession, ChatMessage as IChatMessage } from '../services/aiChatService';

const QUICK_ACTIONS = [
  { label: 'Summarize This Topic', icon: BookOpen },
  { label: 'Quiz Me on This Lesson', icon: BarChart3 },
  { label: "What's Due Soon?", icon: Clock },
  { label: 'Show My Progress', icon: BarChart3 }
];

interface AIChatPanelProps {
  courseId?: number;
  isOpen: boolean;
  onClose: () => void;
  initialMessage?: string;
}

export default function AIChatPanel({ courseId, isOpen, onClose, initialMessage }: AIChatPanelProps) {
  const { user } = useAuth();
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<IChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [processingFile, setProcessingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [lastUserId, setLastUserId] = useState<string | null>(null);
  const lastSentPrompt = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);

  // Detect user/session change and create new chat
  useEffect(() => {
    if (user?.uid && user.uid !== lastUserId) {
      // User has changed or logged in - clear previous session
      localStorage.removeItem('activeChatId');
      setChatSession(null);
      setMessages([]);
      setLastUserId(user.uid);
    }
  }, [user?.uid]);

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
          
          // Add welcome message for fresh chat
          const welcomeMessage: IChatMessage = {
            role: 'assistant',
            content: "Hi! I'm NeoBright AI, your learning assistant. How can I help you today?",
            timestamp: new Date().toISOString()
          };
          setMessages([welcomeMessage]);
          
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

  // Auto-send initial message when provided and chat is ready (single effect, ref-guarded)
  useEffect(() => {
    if (
      initialMessage &&
      chatSession &&
      !loading &&
      !sendingMessage &&
      lastSentPrompt.current !== initialMessage
    ) {
      lastSentPrompt.current = initialMessage;
      handleSendMessage(initialMessage);
    }
  }, [initialMessage, chatSession, loading]);

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

  const handleSendMessage = async (userMessage: string, file?: File) => {
    if (!chatSession) return;

    try {
      setSendingMessage(true);
      setError(null);
      setSelectedAction(null);

      // Build optimistic user message with file metadata if present
      const userMsg: IChatMessage = {
        role: 'user',
        content: userMessage || (file ? 'Analyze this file' : ''),
        timestamp: new Date().toISOString(),
        ...(file && {
          file: {
            name: file.name,
            type: file.type,
            size: file.size
          }
        })
      };
      setMessages((prev) => [...prev, userMsg]);

      // Show processing indicator if file is attached
      if (file) {
        setProcessingFile(true);
      }

      // Send to backend with file if provided
      const response = await aiChatService.sendMessage(chatSession.chatId, userMessage, file);

      setProcessingFile(false);

      // Replace optimistic user msg with backend response (has file metadata), add AI response
      setMessages((prev) => [
        ...prev.slice(0, -1),
        response.userMessage,
        response.assistantMessage
      ]);
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
      setProcessingFile(false);
    }
  };

  const handleQuickAction = (action: string) => {
    setSelectedAction(action);
    handleSendMessage(action);
  };

  const handleClose = () => {
    lastSentPrompt.current = null;
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-30 transition-opacity"
        onClick={handleClose}
      />

      {/* Right-side Panel */}
      <div className="fixed top-0 right-0 h-screen w-full max-w-md bg-white dark:bg-[#1A1C20] border-l border-gray-200 dark:border-[#2A2D32] shadow-2xl flex flex-col z-40 transform transition-transform duration-300 animate-in slide-in-from-right">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#2A2D32] bg-gradient-to-r from-blue-500 to-blue-600 text-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">NeoBright AI</h3>
              <p className="text-xs text-white/80">Ask questions about your courses</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            title="Close chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Actions - Sticky at Top */}
        {!loading && (
          <div ref={quickActionsRef} className="sticky top-0 px-3 py-3 border-b border-gray-200 dark:border-[#2A2D32] bg-white dark:bg-[#1A1C20] z-10 space-y-3">
            {/* Quick Actions Grid - 2x2 */}
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((action) => {
                const IconComponent = action.icon;
                const isSelected = selectedAction === action.label;
                return (
                  <button
                    key={action.label}
                    onClick={() => handleQuickAction(action.label)}
                    disabled={sendingMessage || isRateLimited}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      isSelected
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-50 dark:bg-[#2A2D32] text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-[#3A3D42] border border-gray-200 dark:border-[#3A3D42]'
                    }`}
                    title={action.label}
                  >
                    <IconComponent className="w-3 h-3 flex-shrink-0" />
                    <span className="line-clamp-2">{action.label}</span>
                  </button>
                );
              })}
            </div>

            
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : error && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
              <Sparkles className="w-8 h-8 text-blue-500" />
              <p className="text-sm font-medium text-gray-900 dark:text-white">No messages yet</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Send a message to get started</p>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => {
                // Generate context-aware actions based on the AI's RESPONSE content, not user prompt
                let actions = undefined;
                if (msg.role === 'assistant') {
                  const responseContent = msg.content?.toLowerCase() || '';
                  
                  // Action buttons only appear when AI response suggests a specific action
                  
                  // Progress/Analytics: show analytics link when AI mentions their progress metrics
                  if (responseContent.includes('progress') && (responseContent.includes('completion') || responseContent.includes('overall'))) {
                    actions = [
                      { label: 'View Detailed Analytics', onClick: () => window.location.href = '/analytics' },
                    ];
                  }
                  // Quiz: only show upload action if AI is asking for notes to create quiz
                  else if ((responseContent.includes('upload') || responseContent.includes('share') || responseContent.includes('provide the')) && responseContent.includes('quiz')) {
                    actions = undefined; // File upload is handled by ChatInput, not action buttons
                  }
                  // If AI has actually provided quiz content (numbered questions format)
                  else if (responseContent.match(/^\s*\d+\s*[.)]/m) || responseContent.includes('**question')) {
                    actions = [
                      { label: 'Review Topics First', onClick: () => window.location.href = '/courses' },
                    ];
                  }
                  // Due dates listed: show courses link
                  else if ((responseContent.includes('due') || responseContent.includes('deadline')) && responseContent.includes('date')) {
                    actions = [
                      { label: 'View My Courses', onClick: () => window.location.href = '/courses' },
                    ];
                  }
                  // Summary provided: show quiz option 
                  else if ((responseContent.includes('summary') || responseContent.includes('here\'s an overview')) && !responseContent.includes('which')) {
                    actions = [
                      { label: 'Quiz Me on This lesson', onClick: () => handleQuickAction('Quiz Me on This Lesson') },
                    ];
                  }
                }

                return (
                  <ChatMessage
                    key={idx}
                    role={msg.role}
                    content={msg.content}
                    timestamp={msg.timestamp}
                    file={msg.file}
                    actions={actions}
                  />
                );
              })}
              {/* Processing indicator when reading a document */}
              {processingFile && (
                <ChatMessage
                  role="assistant"
                  content=""
                  timestamp={new Date().toISOString()}
                  isProcessing={true}
                />
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

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
    </>
  );
}
