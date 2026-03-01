import apiClient from '../api/client';

/**
 * Service for managing grade caching and synchronization
 */
export const gradeCacheService = {
  /**
   * Sync grades from Moodle for a course and cache them in Firestore
   */
  async syncCourseGrades(courseId: number) {
    try {
      const response = await apiClient.post(`/grades/sync/${courseId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to sync grades:', error);
      throw error;
    }
  },

  /**
   * Get cached grade for a specific assignment
   */
  async getCachedGrade(courseId: number, assignmentId: number) {
    try {
      const response = await apiClient.get(
        `/grades/${courseId}/assignment/${assignmentId}`
      );
      return response.data;
    } catch (error) {
      console.error('Failed to get cached grade:', error);
      throw error;
    }
  },

  /**
   * Get all cached grades for a course
   */
  async getAllCachedGrades(courseId: number) {
    try {
      const response = await apiClient.get(`/grades/${courseId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get cached grades:', error);
      throw error;
    }
  },

  /**
   * Clear grade cache for a course
   */
  async clearGradeCache(courseId: number) {
    try {
      const response = await apiClient.delete(`/grades/${courseId}/clear`);
      return response.data;
    } catch (error) {
      console.error('Failed to clear grade cache:', error);
      throw error;
    }
  }
};
