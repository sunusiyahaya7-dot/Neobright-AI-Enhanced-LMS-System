import React, { useEffect, useState } from "react";
import AIChatPanel from '../components/AIChatPanel';
import api from '../api/client';
import { useAuth } from "../auth/AuthContext";
import {
  analyticsService,
  AnalyticsOverview,
  CourseAnalytics,
} from "../services/analyticsService";
import { getCourses, getCourseAssignments } from "../services/moodleService";
import { progressService } from "../services/progressService";
import Layout from "../components/Layout";
import {
  Award,
  Clock,
  Target,
  Zap,
  Sparkles,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
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
  RadialBarChart,
  RadialBar,
} from "recharts";


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
  const [assignmentStats, setAssignmentStats] = useState<AssignmentStats>({
    completed: 0,
    pending: 0,
    overdue: 0,
    total: 0,
  });
  const [progressData, setProgressData] = useState<any[]>([]);
  const [weeklyProgressData, setWeeklyProgressData] = useState<any[]>([]);
  const [averageVelocity, setAverageVelocity] = useState<number>(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrompt, setChatPrompt] = useState<string | undefined>(undefined);
  const [aiInsight, setAiInsight] = useState<{ summary: string; actions: { title: string; description: string; priority: string }[]; strengths: string[] } | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    loadAnalytics();
    fetchAiInsight();
  }, []);

  const fetchAiInsight = async (force = false) => {
    try {
      setInsightLoading(true);
      const res = await api.get(`/ai/insights${force ? '?force=true' : ''}`);
      setAiInsight(res.data);
    } catch {
      // Non-critical — keep fallback
    } finally {
      setInsightLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const [analyticsData, coursesResponse, progressOverview] =
        await Promise.all([
          analyticsService.getAnalyticsOverview(),
          getCourses(),
          progressService.getProgressOverview(),
        ]);

      setAnalytics(analyticsData);
      const courseList = coursesResponse?.courses || [];
      setCourses(courseList);
      setProgressData(progressOverview);

      // Set weekly progress data from first course's analytics
      if (analyticsData?.courses && analyticsData.courses.length > 0) {
        const weeklyData = analyticsData.courses[0].weeklyProgress || [];
        setWeeklyProgressData(weeklyData.length > 0 ? weeklyData : []);
        console.log("Weekly Progress Data:", weeklyData);

        // Calculate average velocity from all courses
        const velocities = analyticsData.courses.map((c) => c.velocity || 0);
        const avgVel =
          velocities.length > 0
            ? velocities.reduce((a, b) => a + b, 0) / velocities.length
            : 0;
        setAverageVelocity(Math.round(avgVel * 100) / 100);
      }

      const assignmentPromises = courseList.map((course: Course) =>
        getCourseAssignments(course.id).catch(() => ({ assignments: [] })),
      );
      const assignmentsResponses = await Promise.all(assignmentPromises);
      const allAssignments = assignmentsResponses.flatMap(
        (response: any) => response?.assignments || [],
      );

      const now = Date.now() / 1000;
      const completed = allAssignments.filter(
        (a: any) =>
          a.status === "submitted" || a.status?.toLowerCase() === "completed",
      ).length;
      const overdue = allAssignments.filter(
        (a: any) =>
          a.duedate &&
          a.duedate < now &&
          a.status !== "submitted" &&
          a.status?.toLowerCase() !== "completed",
      ).length;
      const pending = allAssignments.length - completed - overdue;

      setAssignmentStats({
        completed,
        pending,
        overdue,
        total: allAssignments.length,
      });
    } catch (error) {
      console.error("Failed to load analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const avgProgress =
    progressData.length > 0
      ? Math.round(
          progressData.reduce((sum, p) => sum + p.progress, 0) /
            progressData.length,
        )
      : 0;

  const completionRate =
    assignmentStats.total > 0
      ? Math.round((assignmentStats.completed / assignmentStats.total) * 100)
      : 0;

  const weeklyStreak =
    analytics?.courses.filter((c) => c.engagement.inactiveDays <= 2).length ||
    0;

  const getRecommendations = (): string[] => {
    // Use real AI actions if available
    if (aiInsight?.actions?.length) {
      return aiInsight.actions.map(a => a.title || a.description || '');
    }
    // Fallback while loading or on error
    return ["Loading AI recommendations..."];
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#1E5BF0] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">
              Loading analytics...
            </p>
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
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-[#1E5BF0] dark:hover:text-[#2C7CF0] mb-4 transition-colors"
              >
                <ArrowLeft size={18} />
                <span>Back to Dashboard </span>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Progress Insights
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Your learning analytics and performance overview
              </p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-[#1A1C20] rounded-xl p-5 border border-gray-200 dark:border-[#2A2D32]"
              >
                <div className="w-full h-10 bg-[#CFF7EB] dark:bg-teal-900/30 rounded-full relative flex items-center justify-center">
                  <div className="w-8 h-8 bg-white/80 dark:bg-white/10 rounded-full flex items-center justify-center shadow-sm">
                    <Award className="text-teal-600" size={18} />
                  </div>

                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                      {avgProgress}%
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Average Score
                    </p>
                  </div>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white dark:bg-[#1A1C20] rounded-xl p-5 border border-gray-200 dark:border-[#2A2D32]"
              >
                <div className="w-full h-10 bg-[#DDEBFF] dark:bg-blue-900/30 rounded-full relative flex items-center justify-center">
                  <div className="w-8 h-8 bg-white/80 dark:bg-white/10 rounded-full flex items-center justify-center shadow-sm">
                    <Clock className="text-blue-600" size={18} />
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                      {assignmentStats.completed}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Activities Done
                    </p>
                  </div>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white dark:bg-[#1A1C20] rounded-xl p-5 border border-gray-200 dark:border-[#2A2D32]"
              >
                <div className="w-full h-10 bg-[#DDEBFF] dark:bg-blue-900/30 rounded-full relative flex items-center justify-center">
                  <div className="w-8 h-8 bg-white/80 dark:bg-white/10 rounded-full flex items-center justify-center shadow-sm">
                    <Target className="text-blue-600" size={18} />
                  </div>

                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                      {completionRate}%
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Completion Rate
                    </p>
                  </div>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white dark:bg-[#1A1C20] rounded-xl p-5 border border-gray-200 dark:border-[#2A2D32]"
              >
                <div className="w-full h-10 bg-[#FFEBD9] dark:bg-orange-900/30 rounded-full relative flex items-center justify-center">
                  <div className="w-8 h-8 bg-white/80 dark:bg-white/10 rounded-full flex items-center justify-center shadow-sm">
                    <Zap className="text-orange-600" size={18} />
                  </div>

                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                      {weeklyStreak}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Weekly Streak
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-[#1A1C20] rounded-xl p-6 border border-gray-200 dark:border-[#2A2D32]">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">
                  Learning Progress by Week
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={
                      weeklyProgressData && weeklyProgressData.length > 0
                        ? weeklyProgressData
                        : [{ week: "No Data", progress: 0 }]
                    }
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="progress"
                      stroke="#0047AB"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white dark:bg-[#1A1C20] rounded-xl p-6 border border-gray-200 dark:border-[#2A2D32]">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">
                  Assignment Status
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Completed", value: assignmentStats.completed },
                        { name: "Pending", value: assignmentStats.pending },
                        { name: "Overdue", value: assignmentStats.overdue },
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-[#1A1C20] rounded-xl p-6 border border-gray-200 dark:border-[#2A2D32]">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">
                  Course Performance
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={courses.map((course) => {
                      const progressPercent =
                        progressData.find((p) => p.courseId === course.id)
                          ?.progress || 0;
                      return {
                        name: course.shortname,
                        score: progressPercent,
                      };
                    })}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="score" fill="#0047AB" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white dark:bg-[#1A1C20] rounded-xl p-6 border border-gray-200 dark:border-[#2A2D32]">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">
                  Completion Velocity
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {courses.map((course, idx) => {
                    const courseAnalytics = analytics?.courses.find(
                      (c) => c.courseId === course.id,
                    );
                    const velocity = courseAnalytics?.velocity || 0;
                    const maxVelocity = 3;
                    const percentage = Math.min(
                      (velocity / maxVelocity) * 100,
                      100,
                    );
                    const colors = [
                      "from-blue-500 to-blue-600",
                      "from-cyan-500 to-cyan-600",
                      "from-teal-500 to-teal-600",
                      "from-red-500 to-red-600",
                    ];
                    const colorClass = colors[idx % 4];

                    return (
                      <div
                        key={course.id}
                        className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#2A2D32] dark:to-[#1F2228] rounded-lg p-5 border border-gray-200 dark:border-[#3A3D42]"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 truncate">
                              {course.shortname}
                            </p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                              {Math.round(velocity * 100) / 100}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              activities/week
                            </p>
                          </div>
                          <div className="relative w-20 h-20 flex-shrink-0">
                            <svg
                              className="w-full h-full transform -rotate-90"
                              viewBox="0 0 100 100"
                            >
                              <circle
                                cx="50"
                                cy="50"
                                r="45"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="8"
                                className="text-gray-300 dark:text-gray-600"
                              />
                              <circle
                                cx="50"
                                cy="50"
                                r="45"
                                fill="none"
                                stroke={`url(#gradient-${course.id})`}
                                strokeWidth="8"
                                strokeDasharray={`${(percentage / 100) * 283} 283`}
                                strokeLinecap="round"
                                className="transition-all duration-700"
                              />
                              <defs>
                                <linearGradient
                                  id={`gradient-${course.id}`}
                                  x1="0%"
                                  y1="0%"
                                  x2="100%"
                                  y2="100%"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor={
                                      colorClass === "from-blue-500 to-blue-600"
                                        ? "#3B82F6"
                                        : colorClass ===
                                            "from-cyan-500 to-cyan-600"
                                          ? "#06B6D4"
                                          : colorClass ===
                                              "from-teal-500 to-teal-600"
                                            ? "#14B8A6"
                                            : "#EF4444"
                                    }
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor={
                                      colorClass === "from-blue-500 to-blue-600"
                                        ? "#1D4ED8"
                                        : colorClass ===
                                            "from-cyan-500 to-cyan-600"
                                          ? "#0891B2"
                                          : colorClass ===
                                              "from-teal-500 to-teal-600"
                                            ? "#0D9488"
                                            : "#DC2626"
                                    }
                                  />
                                </linearGradient>
                              </defs>
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs font-bold text-gray-900 dark:text-white text-center">
                                {Math.round(percentage)}%
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {velocity >= 2.5 && (
                              <span className="text-green-600 dark:text-green-400 font-semibold">
                                🚀 High Pace
                              </span>
                            )}
                            {velocity >= 1.5 && velocity < 2.5 && (
                              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                📈 Steady
                              </span>
                            )}
                            {velocity < 1.5 && (
                              <span className="text-orange-600 dark:text-orange-400 font-semibold">
                                ⚠️ Slow
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] rounded-xl p-6 text-white">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sparkles size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold mb-2">
                        AI Learning Insight
                      </h3>
                      <button
                        onClick={() => fetchAiInsight(true)}
                        disabled={insightLoading}
                        className="p-1.5 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
                        title="Regenerate insight"
                      >
                        <RefreshCw size={16} className={insightLoading ? 'animate-spin' : ''} />
                      </button>
                    </div>
                    {insightLoading ? (
                      <div className="space-y-2">
                        <div className="h-4 bg-white/20 rounded animate-pulse w-3/4" />
                        <div className="h-4 bg-white/20 rounded animate-pulse w-2/3" />
                      </div>
                    ) : (
                      <p className="text-white/90 text-sm leading-relaxed">
                        {aiInsight?.summary || 'Generating your personalized learning insight...'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-[#1A1C20] rounded-xl p-6 border border-gray-200 dark:border-[#2A2D32]">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                  Recommendations
                </h3>
                <div className="space-y-3">
                  {getRecommendations().map((rec, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-[#1E5BF0] rounded-full mt-2 flex-shrink-0"></div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {rec}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Chat Floating Button */}
            {!chatOpen && (
              <div className="fixed bottom-8 right-8 flex flex-col items-end gap-3 z-30 group">
                <div className="bg-gray-900 dark:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  Ask NeoBright AI
                </div>
                <button
                  onClick={() => setChatOpen(true)}
                  className="w-16 h-16 bg-gradient-to-br from-blue-500 via-blue-500 to-blue-600 hover:from-blue-600 hover:via-blue-600 hover:to-blue-700 text-white rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-110 active:scale-95 z-30"
                  style={{ animation: 'subtle-float 4s ease-in-out 2s infinite' }}
                >
                  <Sparkles className="w-8 h-8" />
                  <div className="absolute inset-0 rounded-full bg-blue-400 opacity-20 group-hover:opacity-40 transition-opacity" style={{ animation: 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
                </button>
              </div>
            )}
      
            <style>{`
              @keyframes subtle-float {
                0%, 100% { transform: translateY(0px) rotate(0deg); }
                25% { transform: translateY(-2px) rotate(-1deg); }
                50% { transform: translateY(0px) rotate(0deg); }
                75% { transform: translateY(-2px) rotate(1deg); }
              }
            `}</style>
      
            {/* Chat Panel */}
            <AIChatPanel
              isOpen={chatOpen}
              onClose={() => {
                setChatOpen(false);
                setChatPrompt(undefined);
              }}
              courseId={0}
              initialMessage={chatPrompt}
            />
    </Layout>
  );
}
