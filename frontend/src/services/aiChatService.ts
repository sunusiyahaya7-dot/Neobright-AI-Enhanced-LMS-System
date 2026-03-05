import api from '../api/client';

/**
 * AI Chat Types
 */

export interface ChatSession {
  chatId: string;
  title: string;
  courseId?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface FileAttachment {
  name: string;
  type: string;
  size: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  file?: FileAttachment;
}

export interface ChatWithMessages extends ChatSession {
  messages: ChatMessage[];
}

export interface SendMessageResponse {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

/**
 * AI Chat Service
 * Handles all AI chat operations
 */
export const aiChatService = {
  /**
   * Create a new chat session
   */
  async createChat(options?: { courseId?: number; title?: string }): Promise<ChatSession> {
    const response = await api.post<ChatSession>('/ai/chats', options || {});
    return response.data;
  },

  /**
   * List all chat sessions for the current user
   */
  async listChats(courseId?: number): Promise<ChatSession[]> {
    const params = courseId ? { courseId } : {};
    const response = await api.get<{ chats: ChatSession[] }>('/ai/chats', { params });
    return response.data.chats;
  },

  /**
   * Get a specific chat with all messages
   */
  async getChat(chatId: string): Promise<ChatWithMessages> {
    const response = await api.get<ChatWithMessages>(`/ai/chats/${chatId}`);
    return response.data;
  },

  /**
   * Send a message and get AI response
   * Optionally supports file upload (PDF or image)
   */
  async sendMessage(chatId: string, message: string, file?: File): Promise<SendMessageResponse> {
    if (file) {
      // Use FormData for file upload
      // IMPORTANT: Do NOT set Content-Type header manually - Axios/browser
      // must auto-set it with the correct multipart boundary
      const formData = new FormData();
      formData.append('message', message);
      formData.append('file', file);
      
      const response = await api.post<SendMessageResponse>(`/ai/chats/${chatId}/messages`, formData, {
        timeout: 120000, // 2 min timeout for file processing
      });
      return response.data;
    } else {
      // Use JSON for text-only messages
      const response = await api.post<SendMessageResponse>(`/ai/chats/${chatId}/messages`, {
        message
      });
      return response.data;
    }
  },

  /**
   * Send a message and stream the AI response via SSE.
   * Calls onDelta for each text chunk and onDone with the full reply.
   * Falls back to sendMessage() on error.
   */
  async sendMessageStream(
    chatId: string,
    message: string,
    callbacks: {
      onDelta: (text: string) => void;
      onDone: (fullText: string) => void;
      onError: (err: Error) => void;
    },
  ): Promise<void> {
    const { auth: firebaseAuth } = await import('../firebase');
    const token = await firebaseAuth.currentUser?.getIdToken();
    const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

    const response = await fetch(`${baseURL}/ai/chats/${chatId}/messages/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || `Stream failed (${response.status})`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('ReadableStream not supported');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';  // keep incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const payload = JSON.parse(trimmed.slice(6));
            if (payload.type === 'delta') {
              callbacks.onDelta(payload.content);
            } else if (payload.type === 'done') {
              callbacks.onDone(payload.content);
            } else if (payload.type === 'error') {
              callbacks.onError(new Error(payload.content));
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  /**
   * Delete a chat session
   */
  async deleteChat(chatId: string): Promise<void> {
    await api.delete(`/ai/chats/${chatId}`);
  }
};
