import { useEffect, useState, useRef } from 'react';
import { X, Sparkles, BookOpen, BarChart3, Clock, AlertCircle, Loader2 } from 'lucide-react';
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
  initialMessageMode?: 'send' | 'draft';
}

export default function AIChatPanel({ courseId, isOpen, onClose, initialMessage, initialMessageMode = 'send' }: AIChatPanelProps) {
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<IChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [processingFile, setProcessingFile] = useState(false);
  const [waitingForStream, setWaitingForStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const lastSentPrompt = useRef<string | null>(null);
  const openCourseIdRef = useRef<number | undefined>(undefined);
  const initRunIdRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);

  // Freeze courseId for the lifetime of an open panel to avoid re-initializing
  // chat (and clobbering optimistic messages) if courseId changes mid-stream.
  useEffect(() => {
    if (isOpen) {
      openCourseIdRef.current = courseId;
    } else {
      openCourseIdRef.current = undefined;
    }
  }, [isOpen, courseId]);

  // Load or create chat session on mount
  useEffect(() => {
    if (!isOpen) return;

    const runId = ++initRunIdRef.current;
    let cancelled = false;

    const initChat = async () => {
      try {
        setLoading(true);
        setError(null);

        const effectiveCourseId = openCourseIdRef.current;

        // Use course-specific localStorage key so each course has its own chat
        const storageKey = effectiveCourseId ? `activeChatId_${effectiveCourseId}` : 'activeChatId';
        const cachedChatId = localStorage.getItem(storageKey);

        if (cachedChatId) {
          // Load existing chat
          try {
            const chat = await aiChatService.getChat(cachedChatId);
            if (cancelled || initRunIdRef.current !== runId) return;
            setChatSession(chat);
            setMessages(chat.messages || []);
          } catch {
            // Chat not found (deleted/expired) — create a new one
            localStorage.removeItem(storageKey);
            const newChat = await aiChatService.createChat({
              courseId: effectiveCourseId,
              title: effectiveCourseId ? `Course ${effectiveCourseId} Chat` : 'Dashboard Chat'
            });
            if (cancelled || initRunIdRef.current !== runId) return;
            setChatSession(newChat);
            const welcomeMessage: IChatMessage = {
              role: 'assistant',
              content: "Hi! I'm NeoBright AI, your learning assistant. How can I help you today?",
              timestamp: new Date().toISOString()
            };
            setMessages([welcomeMessage]);
            localStorage.setItem(storageKey, newChat.chatId);
          }
        } else {
          // Create new chat
          const newChat = await aiChatService.createChat({
            courseId: effectiveCourseId,
            title: effectiveCourseId ? `Course ${effectiveCourseId} Chat` : 'Dashboard Chat'
          });
          if (cancelled || initRunIdRef.current !== runId) return;
          setChatSession(newChat);
          
          // Add welcome message for fresh chat
          const welcomeMessage: IChatMessage = {
            role: 'assistant',
            content: "Hi! I'm NeoBright AI, your learning assistant. How can I help you today?",
            timestamp: new Date().toISOString()
          };
          setMessages([welcomeMessage]);
          
          localStorage.setItem(storageKey, newChat.chatId);
        }
      } catch (err: any) {
        if (cancelled || initRunIdRef.current !== runId) return;
        setError(err.message || 'Failed to load chat');
      } finally {
        if (cancelled || initRunIdRef.current !== runId) return;
        setLoading(false);
      }
    };

    initChat();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Auto-send initial message when provided and chat is ready (single effect, ref-guarded)
  useEffect(() => {
    if (initialMessageMode !== 'send') return;
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
  }, [initialMessageMode, initialMessage, chatSession, loading, sendingMessage]);

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

      // ── Streaming path (text-only, no file) ──────────
      if (!file) {
        setWaitingForStream(true);

        try {
          await aiChatService.sendMessageStream(chatSession.chatId, userMessage, {
            onDelta: (delta) => {
              setWaitingForStream(false);
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant') {
                  // Append to existing assistant message
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...last, content: last.content + delta };
                  return updated;
                }
                // No assistant message yet — add one with this first token
                return [...prev, { role: 'assistant', content: delta, timestamp: new Date().toISOString() }];
              });
            },
            onDone: (fullText) => {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: fullText,
                    timestamp: new Date().toISOString(),
                  };
                }
                return updated;
              });
            },
            onError: (err) => {
              setError(err.message || 'Streaming failed');
              // Remove the empty assistant placeholder
              setMessages((prev) => {
                const updated = [...prev];
                if (updated[updated.length - 1]?.role === 'assistant' && !updated[updated.length - 1]?.content) {
                  return updated.slice(0, -1);
                }
                return updated;
              });
            },
          });
        } catch (streamErr: any) {
          // Streaming failed — fall back to sync endpoint
          console.warn('Stream failed, falling back to sync:', streamErr.message);
          // Remove the empty assistant placeholder
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
            return prev;
          });

          const response = await aiChatService.sendMessage(chatSession.chatId, userMessage);
          setMessages((prev) => {
            // Replace user msg with backend version and add assistant msg
            const withoutLastUser = prev.slice(0, -1);
            return [...withoutLastUser, response.userMessage, response.assistantMessage];
          });
        }
      } else {
        // ── File upload path (non-streaming) ─────────
        const response = await aiChatService.sendMessage(chatSession.chatId, userMessage, file);

        setProcessingFile(false);

        // Replace optimistic user msg with backend response (has file metadata), add AI response
        setMessages((prev) => [
          ...prev.slice(0, -1),
          response.userMessage,
          response.assistantMessage
        ]);
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err.message || 'Failed to send message';

      // Check if rate limited
      if (err?.response?.status === 429) {
        setIsRateLimited(true);
        // Extract wait time from backend response
        const msg = err?.response?.data?.message || err?.response?.data?.error || '';
        const secondsMatch = msg.match(/wait\s+(\d+)\s*seconds?/i);
        const minutesMatch = msg.match(/wait\s+(\d+)\s*minutes?/i);
        const countdown = secondsMatch ? parseInt(secondsMatch[1], 10)
          : minutesMatch ? parseInt(minutesMatch[1], 10) * 60
          : 60;
        setRateLimitCountdown(countdown);
        setError(msg || 'Rate limit exceeded. Please wait before sending another message.');
      } else {
        setError(errorMsg);
      }

      // Remove optimistic user message on error
      setMessages((prev) => prev.slice(0, -1));

      // Re-throw so ChatInput knows the send failed and preserves user input
      throw err;
    } finally {
      setSendingMessage(false);
      setProcessingFile(false);
      setWaitingForStream(false);
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
              {/* Thinking indicator — show only for file processing.
                  Text messages use streaming, so the reply appears token-by-token. */}
              {(processingFile || waitingForStream) && (
                <ChatMessage
                  role="assistant"
                  content=""
                  timestamp={new Date().toISOString()}
                  isProcessing={true}
                  processingLabel={processingFile ? 'Reading document...' : 'Thinking...'}
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
          draftMessage={initialMessageMode === 'draft' ? initialMessage : undefined}
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
