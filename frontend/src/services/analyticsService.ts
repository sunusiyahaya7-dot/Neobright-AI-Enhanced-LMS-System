import api from '../api/client';

export interface WeeklyProgress {
  week: string;
  progress: number;
}

export interface Engagement {
  lastActive: string | null;
  inactiveDays: number;
  engagementLevel: 'low' | 'medium' | 'high';
}

export interface CourseAnalytics {
  courseId: number;
  weeklyProgress: WeeklyProgress[];
  velocity: number;
  engagement: Engagement;
  riskLevel: 'low' | 'medium' | 'high';
  lastUpdated: string;
}

export interface AnalyticsOverview {
  overallRisk: 'low' | 'medium' | 'high';
  averageVelocity: number;
  totalCoursesAtRisk: number;
  courses: CourseAnalytics[];
}

export interface RiskAssessment {
  courseId: number;
  riskLevel: 'low' | 'medium' | 'high';
  reasons: string[];
}

class AnalyticsService {
  /**
   * Get analytics overview across all enrolled courses
   */
  async getAnalyticsOverview(): Promise<AnalyticsOverview> {
    const response = await api.get<AnalyticsOverview>('/analytics/overview');
    return response.data;
  }

  /**
   * Get detailed analytics for a specific course
   */
  async getCourseAnalytics(courseId: number): Promise<CourseAnalytics> {
    const response = await api.get<CourseAnalytics>(`/analytics/course/${courseId}`);
    return response.data;
  }

  /**
   * Get risk assessment for a specific course
   */
  async getRiskAssessment(courseId: number): Promise<RiskAssessment> {
    const response = await api.get<RiskAssessment>(`/analytics/risk/${courseId}`);
    return response.data;
  }
}

export const analyticsService = new AnalyticsService();
