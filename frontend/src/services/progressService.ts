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
  },

  /**
   * Mark an activity as complete
   */
  async markActivityComplete(courseId: number, activityId: number): Promise<boolean> {
    try {
      const response = await api.post(
        `/progress/course/${courseId}/activity/${activityId}/complete`
      );
      return response.data.success;
    } catch (error) {
      console.error(
        `Failed to mark activity ${activityId} as complete:`,
        error
      );
      throw error;
    }
  },

  /**
   * Get all activity completions for a course
   */
  async getCourseCompletions(courseId: number): Promise<Record<string, boolean>> {
    try {
      const response = await api.get(`/progress/course/${courseId}/completions`);
      return response.data;
    } catch (error) {
      console.error(
        `Failed to fetch completions for course ${courseId}:`,
        error
      );
      throw error;
    }
  }
};
