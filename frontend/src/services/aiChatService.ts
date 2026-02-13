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
   * Delete a chat session
   */
  async deleteChat(chatId: string): Promise<void> {
    await api.delete(`/ai/chats/${chatId}`);
  }
};
