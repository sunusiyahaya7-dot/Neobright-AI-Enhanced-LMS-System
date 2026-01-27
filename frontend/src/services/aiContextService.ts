import { api } from './client';

/**
 * AI Context Structures
 */

export interface StudentInfo {
  id: string;
  name: string;
}

export interface CourseContext {
  id: string;
  name: string;
  progress: number;
  averageScore: number;
  completedActivities: number;
  totalActivities: number;
  lastAccess: string;
}

export interface AnalyticsContext {
  overallProgress: number;
  weeklyProgress: number[];
  completionRate: number;
  velocityActivitiesPerWeek: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface AIContext {
  student: StudentInfo;
  courses: CourseContext[];
  analytics: AnalyticsContext;
  timestamp?: string;
  error?: string;
}

/**
 * AI Context Service
 * Fetches standardized AI context for all AI features
 */
export const aiContextService = {
  /**
   * Get complete AI context for logged-in student
   * This is the single source of truth for AI features
   */
  async getContext(): Promise<AIContext> {
    try {
      const response = await api.get<AIContext>('/ai/context');
      return response;
    } catch (error) {
      console.error('Failed to fetch AI context:', error);
      throw error;
    }
  },

  /**
   * Get just the student info
   */
  async getStudent(): Promise<StudentInfo> {
    const context = await this.getContext();
    return context.student;
  },

  /**
   * Get courses with progress
   */
  async getCourses(): Promise<CourseContext[]> {
    const context = await this.getContext();
    return context.courses;
  },

  /**
   * Get overall analytics
   */
  async getAnalytics(): Promise<AnalyticsContext> {
    const context = await this.getContext();
    return context.analytics;
  }
};
