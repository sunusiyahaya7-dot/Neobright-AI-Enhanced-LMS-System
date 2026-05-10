import api from '../api/client';

export interface WeeklyProgress {
  week: string;
  progress: number;
}

export type ProgressGranularity = 'week' | 'month' | 'year';

export interface ProgressTrendPoint {
  label: string;
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

  /**
   * Get progress trend for a course grouped by week/month/year.
   */
  async getCourseProgressTrend(
    courseId: number,
    options: { granularity: ProgressGranularity; year?: number; month?: number },
  ): Promise<ProgressTrendPoint[]> {
    const params = new URLSearchParams();
    params.set('granularity', options.granularity);
    if (typeof options.year === 'number') params.set('year', String(options.year));
    if (typeof options.month === 'number') params.set('month', String(options.month));

    const qs = params.toString();
    const response = await api.get<ProgressTrendPoint[]>(
      `/analytics/course/${courseId}/progress-trend${qs ? `?${qs}` : ''}`,
    );
    return response.data;
  }
}

export const analyticsService = new AnalyticsService();
