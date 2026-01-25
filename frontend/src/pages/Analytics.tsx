import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { analyticsService, AnalyticsOverview, CourseAnalytics } from '../services/analyticsService';
import { getCourses } from '../services/moodleService';
import Layout from '../components/Layout';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Zap
} from 'lucide-react';
import { motion } from 'framer-motion';

interface Course {
  id: number;
  fullname: string;
  shortname: string;
}

export default function Analytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const [analyticsData, coursesResponse] = await Promise.all([
        analyticsService.getAnalyticsOverview(),
        getCourses()
      ]);
      setAnalytics(analyticsData);
      const courseList = coursesResponse?.courses || [];
      setCourses(courseList);
      if (courseList.length > 0 && !selectedCourse) {
        setSelectedCourse(courseList[0].id);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCourseName = (courseId: number) => {
    return courses.find(c => c.id === courseId)?.fullname || `Course ${courseId}`;
  };

  const getRiskColor = (riskLevel: 'low' | 'medium' | 'high') => {
    switch (riskLevel) {
      case 'high': return 'text-red-600 bg-red-100 dark:bg-red-900/30';
      case 'medium': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
      case 'low': return 'text-green-600 bg-green-100 dark:bg-green-900/30';
    }
  };

  const getEngagementColor = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'high': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-red-600';
    }
  };

  const selectedCourseAnalytics = analytics?.courses.find(c => c.courseId === selectedCourse);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#1E5BF0] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading analytics...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0F1115]">
        {/* Header */}
        <div className="bg-white dark:bg-[#1A1C20] border-b border-gray-200 dark:border-[#2A2D32]">
          <div className="p-8">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="text-[#1E5BF0]" size={32} />
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Learning Analytics</h1>
              </div>
              <p className="text-gray-600 dark:text-gray-400">Track your progress and identify areas for improvement</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Overall Risk */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white dark:bg-[#1A1C20] rounded-lg p-6 border border-gray-200 dark:border-[#2A2D32]"
              >
                <div className="flex items-center gap-3 mb-4">
                  {analytics?.overallRisk === 'high' ? (
                    <AlertTriangle className="text-red-600" size={24} />
                  ) : analytics?.overallRisk === 'medium' ? (
                    <Clock className="text-yellow-600" size={24} />
                  ) : (
                    <CheckCircle className="text-green-600" size={24} />
                  )}
                  <h3 className="font-semibold text-gray-900 dark:text-white">Overall Risk</h3>
                </div>
                <div className={`inline-block px-4 py-2 rounded-full ${getRiskColor(analytics?.overallRisk || 'low')}`}>
                  <span className="font-bold uppercase text-sm">{analytics?.overallRisk || 'Low'}</span>
                </div>
              </motion.div>

              {/* Average Velocity */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white dark:bg-[#1A1C20] rounded-lg p-6 border border-gray-200 dark:border-[#2A2D32]"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Activity className="text-[#1E5BF0]" size={24} />
                  <h3 className="font-semibold text-gray-900 dark:text-white">Avg Completion Rate</h3>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">
                  {analytics?.averageVelocity.toFixed(1) || '0.0'}
                  <span className="text-lg text-gray-500 dark:text-gray-400 ml-1">activities/week</span>
                </div>
              </motion.div>

              {/* Courses at Risk */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white dark:bg-[#1A1C20] rounded-lg p-6 border border-gray-200 dark:border-[#2A2D32]"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Zap className="text-yellow-600" size={24} />
                  <h3 className="font-semibold text-gray-900 dark:text-white">Needs Attention</h3>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">
                  {analytics?.totalCoursesAtRisk || 0}
                  <span className="text-lg text-gray-500 dark:text-gray-400 ml-1">
                    / {analytics?.courses.length || 0} courses
                  </span>
                </div>
              </motion.div>
            </div>

            {/* Course Selector */}
            <div className="bg-white dark:bg-[#1A1C20] rounded-lg p-6 border border-gray-200 dark:border-[#2A2D32]">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Select Course</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {courses.map(course => {
                  const courseAnalytics = analytics?.courses.find(c => c.courseId === course.id);
                  return (
                    <button
                      key={course.id}
                      onClick={() => setSelectedCourse(course.id)}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        selectedCourse === course.id
                          ? 'border-[#1E5BF0] bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-[#2A2D32] hover:border-gray-300 dark:hover:border-[#3A3D42]'
                      }`}
                    >
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1 truncate">{course.shortname}</h4>
                      {courseAnalytics && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`px-2 py-1 rounded ${getRiskColor(courseAnalytics.riskLevel)}`}>
                            {courseAnalytics.riskLevel}
                          </span>
                          <span className="text-gray-600 dark:text-gray-400">
                            {courseAnalytics.velocity.toFixed(1)}/wk
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Course Analytics Details */}
            {selectedCourseAnalytics && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Weekly Progress Chart */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white dark:bg-[#1A1C20] rounded-lg p-6 border border-gray-200 dark:border-[#2A2D32]"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <TrendingUp className="text-[#1E5BF0]" size={24} />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Weekly Progress Trend</h3>
                  </div>
                  
                  {selectedCourseAnalytics.weeklyProgress.length > 0 ? (
                    <div className="space-y-3">
                      {selectedCourseAnalytics.weeklyProgress.map((week, index) => {
                        const prevProgress = index > 0 ? selectedCourseAnalytics.weeklyProgress[index - 1].progress : week.progress;
                        const trend = week.progress > prevProgress ? 'up' : week.progress < prevProgress ? 'down' : 'same';
                        
                        return (
                          <div key={week.week} className="flex items-center gap-3">
                            <span className="text-sm text-gray-600 dark:text-gray-400 w-24">{week.week}</span>
                            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                              <div
                                className="bg-[#1E5BF0] h-2 rounded-full transition-all"
                                style={{ width: `${week.progress}%` }}
                              />
                            </div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-white w-12 text-right">
                              {week.progress.toFixed(0)}%
                            </span>
                            {trend === 'up' && <TrendingUp size={16} className="text-green-600" />}
                            {trend === 'down' && <TrendingDown size={16} className="text-red-600" />}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400">No progress data available</p>
                  )}
                </motion.div>

                {/* Engagement & Velocity */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  {/* Velocity Card */}
                  <div className="bg-white dark:bg-[#1A1C20] rounded-lg p-6 border border-gray-200 dark:border-[#2A2D32]">
                    <div className="flex items-center gap-3 mb-4">
                      <Activity className="text-[#1ABC9C]" size={24} />
                      <h3 className="font-semibold text-gray-900 dark:text-white">Completion Velocity</h3>
                    </div>
                    <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                      {selectedCourseAnalytics.velocity.toFixed(1)}
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">activities per week</p>
                  </div>

                  {/* Engagement Card */}
                  <div className="bg-white dark:bg-[#1A1C20] rounded-lg p-6 border border-gray-200 dark:border-[#2A2D32]">
                    <div className="flex items-center gap-3 mb-4">
                      <Clock className={getEngagementColor(selectedCourseAnalytics.engagement.engagementLevel)} size={24} />
                      <h3 className="font-semibold text-gray-900 dark:text-white">Engagement Level</h3>
                    </div>
                    <div className={`inline-block px-4 py-2 rounded-full mb-3 ${
                      selectedCourseAnalytics.engagement.engagementLevel === 'high'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                        : selectedCourseAnalytics.engagement.engagementLevel === 'medium'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-600'
                    }`}>
                      <span className="font-bold uppercase text-sm">{selectedCourseAnalytics.engagement.engagementLevel}</span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <p>Inactive for {selectedCourseAnalytics.engagement.inactiveDays} days</p>
                      {selectedCourseAnalytics.engagement.lastActive && (
                        <p>Last active: {new Date(selectedCourseAnalytics.engagement.lastActive).toLocaleDateString()}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            )}

            {/* All Courses Summary */}
            <div className="bg-white dark:bg-[#1A1C20] rounded-lg p-6 border border-gray-200 dark:border-[#2A2D32]">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-6">All Courses Overview</h3>
              <div className="space-y-4">
                {analytics?.courses.map(courseAnalytics => (
                  <div
                    key={courseAnalytics.courseId}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#111418] rounded-lg"
                  >
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                        {getCourseName(courseAnalytics.courseId)}
                      </h4>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>Velocity: {courseAnalytics.velocity.toFixed(1)}/wk</span>
                        <span className={getEngagementColor(courseAnalytics.engagement.engagementLevel)}>
                          {courseAnalytics.engagement.engagementLevel} engagement
                        </span>
                      </div>
                    </div>
                    <div className={`px-4 py-2 rounded-full ${getRiskColor(courseAnalytics.riskLevel)}`}>
                      <span className="font-bold uppercase text-sm">{courseAnalytics.riskLevel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
