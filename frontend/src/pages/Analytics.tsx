import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { analyticsService, AnalyticsOverview, CourseAnalytics } from '../services/analyticsService';
import { getCourses, getCourseAssignments } from '../services/moodleService';
import { progressService } from '../services/progressService';
import Layout from '../components/Layout';
import { 
  TrendingUp, 
  Award,
  Clock,
  Target,
  Zap,
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface Course {
  id: number;
  fullname: string;
  shortname: string;
}

interface AssignmentStats {
  completed: number;
  pending: number;
  overdue: number;
  total: number;
}

export default function Analytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignmentStats, setAssignmentStats] = useState<AssignmentStats>({ completed: 0, pending: 0, overdue: 0, total: 0 });
  const [progressData, setProgressData] = useState<any[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const [analyticsData, coursesResponse, progressOverview] = await Promise.all([
        analyticsService.getAnalyticsOverview(),
        getCourses(),
        progressService.getProgressOverview()
      ]);
      
      setAnalytics(analyticsData);
      const courseList = coursesResponse?.courses || [];
      setCourses(courseList);
      setProgressData(progressOverview);

      const assignmentPromises = courseList.map((course: Course) => 
        getCourseAssignments(course.id).catch(() => [])
      );
      const assignmentsResponses = await Promise.all(assignmentPromises);
      const allAssignments = assignmentsResponses.flat();
      
      const now = Date.now() / 1000;
      const completed = allAssignments.filter((a: any) => a.status === 'submitted').length;
      const overdue = allAssignments.filter((a: any) => a.duedate && a.duedate < now && a.status !== 'submitted').length;
      const pending = allAssignments.length - completed - overdue;
      
      setAssignmentStats({
        completed,
        pending,
        overdue,
        total: allAssignments.length
      });
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const avgProgress = progressData.length > 0 
    ? Math.round(progressData.reduce((sum, p) => sum + p.progress, 0) / progressData.length)
    : 0;

  const completionRate = assignmentStats.total > 0
    ? Math.round((assignmentStats.completed / assignmentStats.total) * 100)
    : 0;

  const weeklyStreak = analytics?.courses.filter(c => c.engagement.inactiveDays <= 2).length || 0;

  const getRecommendations = () => {
    const recs: string[] = [];
    const atRiskCourses = analytics?.courses.filter(c => c.riskLevel === 'high' || c.riskLevel === 'medium') || [];
    
    if (atRiskCourses.length > 0) {
      const worstCourse = courses.find(c => c.id === atRiskCourses[0]?.courseId);
      if (worstCourse) {
        recs.push(`Focus on ${worstCourse.shortname} - it's your lowest performing course`);
      }
    }
    
    if (avgProgress < 60) {
      recs.push('Schedule 20-minute daily recap sessions for better retention');
    }
    
    if (assignmentStats.overdue > 0) {
      recs.push(`Complete ${assignmentStats.overdue} overdue assignment${assignmentStats.overdue > 1 ? 's' : ''} as soon as possible`);
    } else if (assignmentStats.pending > 0) {
      recs.push('Stay ahead by completing upcoming assignments early');
    }
    
    return recs.length > 0 ? recs : ['Great work! Keep maintaining your current study pace'];
  };

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
        <div className="bg-white dark:bg-[#1A1C20] border-b border-gray-200 dark:border-[#2A2D32]">
          <div className="p-6">
            <div className="max-w-7xl mx-auto">
              <Link to="/dashboard" className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-[#1E5BF0] dark:hover:text-[#2C7CF0] mb-4 transition-colors">
                <ArrowLeft size={20} />
                <span>Back to Dashboard</span>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Progress Insights</h1>
              <p className="text-gray-600 dark:text-gray-400">Your learning analytics and performance overview</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-[#1A1C20] rounded-xl p-5 border border-gray-200 dark:border-[#2A2D32]">
                <div className="w-full h-10 bg-[#CFF7EB] dark:bg-teal-900/30 rounded-full relative flex items-center justify-center">
                  <div className="w-8 h-8 bg-white/80 dark:bg-white/10 rounded-full flex items-center justify-center shadow-sm">
                    <Award className="text-teal-600" size={18} />
                  </div>
                  <div className="absolute right-3 flex items-center gap-1 text-teal-600 text-sm font-semibold">
                    <TrendingUp size={16} /><span>+5%</span>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{avgProgress}%</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Average Score</p>
                  </div>
                </div>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white dark:bg-[#1A1C20] rounded-xl p-5 border border-gray-200 dark:border-[#2A2D32]">
                <div className="w-full h-10 bg-[#DDEBFF] dark:bg-blue-900/30 rounded-full relative flex items-center justify-center">
                  <div className="w-8 h-8 bg-white/80 dark:bg-white/10 rounded-full flex items-center justify-center shadow-sm">
                    <Clock className="text-blue-600" size={18} />
                  </div>
                  <div className="absolute right-3 flex items-center gap-1 text-teal-600 text-sm font-semibold">
                    <TrendingUp size={16} /><span>+3h</span>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{Math.max(24, weeklyStreak * 4)}h</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Study Hours</p>
                  </div>
                </div>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white dark:bg-[#1A1C20] rounded-xl p-5 border border-gray-200 dark:border-[#2A2D32]">
                <div className="w-full h-10 bg-[#DDEBFF] dark:bg-blue-900/30 rounded-full relative flex items-center justify-center">
                  <div className="w-8 h-8 bg-white/80 dark:bg-white/10 rounded-full flex items-center justify-center shadow-sm">
                    <Target className="text-blue-600" size={18} />
                  </div>
                  <div className="absolute right-3 flex items-center gap-1 text-teal-600 text-sm font-semibold">
                    <TrendingUp size={16} /><span>+12%</span>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{completionRate}%</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Completion Rate</p>
                  </div>
                </div>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white dark:bg-[#1A1C20] rounded-xl p-5 border border-gray-200 dark:border-[#2A2D32]">
                <div className="w-full h-10 bg-[#FFEBD9] dark:bg-orange-900/30 rounded-full relative flex items-center justify-center">
                  <div className="w-8 h-8 bg-white/80 dark:bg-white/10 rounded-full flex items-center justify-center shadow-sm">
                    <Zap className="text-orange-600" size={18} />
                  </div>
                  <div className="absolute right-3 flex items-center gap-1 text-teal-600 text-sm font-semibold">
                    <TrendingUp size={16} /><span>+2</span>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{weeklyStreak}</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Weekly Streak</p>
                  </div>
                </div>
              </motion.div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-[#1A1C20] rounded-xl p-6 border border-gray-200 dark:border-[#2A2D32]">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Learning Progress by Week</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics?.courses[0]?.weeklyProgress || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="progress" stroke="#0047AB" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white dark:bg-[#1A1C20] rounded-xl p-6 border border-gray-200 dark:border-[#2A2D32]">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Assignment Status</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Completed', value: assignmentStats.completed },
                        { name: 'Pending', value: assignmentStats.pending },
                        { name: 'Overdue', value: assignmentStats.overdue }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      fill="#1ABC9C"
                    >
                      <Cell fill="#1ABC9C" />
                      <Cell fill="#1E90FF" />
                      <Cell fill="#FF6B6B" />
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white dark:bg-[#1A1C20] rounded-xl p-6 border border-gray-200 dark:border-[#2A2D32]">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Course Performance</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={courses.map((course) => {
                  const progressPercent = progressData.find(p => p.courseId === course.id)?.progress || 0;
                  return {
                    name: course.shortname,
                    score: progressPercent
                  };
                })}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="score" fill="#0047AB" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] rounded-xl p-6 text-white">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sparkles size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">AI Learning Insight</h3>
                    <p className="text-white/90 text-sm leading-relaxed">
                      {avgProgress >= 75 
                        ? "Excellent progress! You're maintaining strong performance across all courses. Consider challenging yourself with advanced topics."
                        : avgProgress >= 50
                        ? "Good momentum! Focus on completing pending assignments to maintain your upward trend. Your consistency is paying off."
                        : "Your learning patterns show room for improvement. Try breaking study sessions into smaller chunks and reviewing material regularly."
                      }
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-[#1A1C20] rounded-xl p-6 border border-gray-200 dark:border-[#2A2D32]">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Recommendations</h3>
                <div className="space-y-3">
                  {getRecommendations().map((rec, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-[#1E5BF0] rounded-full mt-2 flex-shrink-0"></div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
