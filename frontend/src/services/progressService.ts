import api from "../api/client";

export interface CourseProgress {
  progress: number;
  completed: number;
  total: number;
  lastSynced?: number;
}

export interface ProgressOverview {
  courseId: number;
  progress: number;
  completed: number;
  total: number;
}

export const progressService = {
  /**
   * Get progress for a single course
   */
  async getCourseProgress(courseId: number): Promise<CourseProgress> {
    try {
      const response = await api.get(`/progress/course/${courseId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch progress for course ${courseId}:`, error);
      throw error;
    }
  },

  /**
   * Get progress overview for all enrolled courses
   */
  async getProgressOverview(): Promise<ProgressOverview[]> {
    try {
      const response = await api.get(`/progress/overview`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch progress overview:', error);
      throw error;
    }
  }
};
