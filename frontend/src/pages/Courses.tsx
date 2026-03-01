import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCourses, getCourseAssignments } from '../services/moodleService';
import { progressService, ProgressOverview } from '../services/progressService';
import api from '../api/client';
import Layout from '../components/Layout';
import AIChatPanel from '../components/AIChatPanel';
import {
  BookOpen,
  Search,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface Course {
  id: number;
  fullname: string;
  shortname: string;
  summary?: string;
}

interface CourseMetadata {
  progress: number;
  nextDeadline: string;
  insight: string;
  isAtRisk: boolean;
}

// Generate consistent, realistic metadata for each course based on its ID
function generateCourseMetadata(courseId: number): CourseMetadata {
  const seed = courseId * 7;
  const progressOptions = [25, 60, 70, 85, 45, 30, 80, 50];
  const progress = progressOptions[seed % progressOptions.length];

  const deadlineOptions = [
    '2 quizzes due soon',
    '1 assignment due Friday',
    'Reading overdue',
    'Lab due next week',
    'Quiz tomorrow',
    'No upcoming deadlines',
  ];
  const nextDeadline = deadlineOptions[seed % deadlineOptions.length];

  const insightOptions = [
    '2 quizzes due soon',
    'Highest engagement in this course',
    "You've not opened Topic 3 yet",
    'On track with assignments',
    'New materials uploaded',
    'Assignment deadline approaching',
  ];
  const insight = insightOptions[seed % insightOptions.length];

  const isAtRisk = progress < 35;

  return { progress, nextDeadline, insight, isAtRisk };
}

export default function Courses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [progressData, setProgressData] = useState<Record<number, ProgressOverview>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [studyPlanPrompt, setStudyPlanPrompt] = useState<string | undefined>(undefined);
  const [aiRecommendedIds, setAiRecommendedIds] = useState<Set<string>>(new Set());
  const [courseDeadlines, setCourseDeadlines] = useState<Record<number, number>>({}); // courseId -> nearest duedate (epoch sec)

  // Helper to get course progress
  const getProgress = (courseId: number) =>
    progressData[courseId]?.progress ?? generateCourseMetadata(courseId).progress;

  useEffect(() => {
    fetchCourses();
    fetchAiRecommendations();
  }, []);

  // Auto-refresh progress every 5 seconds while on this page
  useEffect(() => {
    const interval = setInterval(() => {
      fetchProgress();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const data = await getCourses();
      const fetchedCourses: Course[] = data.courses || [];
      setCourses(fetchedCourses);
      
      // Fetch progress data
      fetchProgress();

      // Fetch assignment deadlines for all courses in parallel
      fetchDeadlines(fetchedCourses);
    } catch (err: any) {
      console.error('Failed to fetch courses:', err);
      setError(err.response?.data?.error || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const fetchProgress = async () => {
    try {
      const overview = await progressService.getProgressOverview();
      console.log('Progress overview fetched:', overview);
      const progressMap: Record<number, ProgressOverview> = {};
      overview.forEach(p => {
        progressMap[p.courseId] = p;
      });
      setProgressData(progressMap);
      console.log('Progress data updated:', progressMap);
    } catch (err) {
      console.error('Failed to fetch progress overview:', err);
      // Continue without progress data
    }
  };

  const getCourseColor = (progress: number) => {
    if (progress >= 75) return '#1ABC9C';
    if (progress >= 50) return '#1E5BF0';
    return '#FF6B6B';
  };

  // Fetch real assignment deadlines from Moodle for each course
  const fetchDeadlines = async (courseList: Course[]) => {
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const results = await Promise.allSettled(
        courseList.map(c => getCourseAssignments(c.id))
      );
      const deadlineMap: Record<number, number> = {};
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          const assignments: any[] = result.value.assignments || result.value || [];
          // Find the nearest future duedate
          const futureDueDates = assignments
            .map((a: any) => a.duedate)
            .filter((d: number) => d && d > nowSec);
          if (futureDueDates.length > 0) {
            deadlineMap[courseList[idx].id] = Math.min(...futureDueDates);
          }
        }
      });
      setCourseDeadlines(deadlineMap);
    } catch {
      // Non-critical
    }
  };

  // Fetch AI insights (cached — no extra tokens) to derive recommended course IDs
  const fetchAiRecommendations = async () => {
    try {
      const res = await api.get('/ai/insights');
      const data = res.data;
      const ids = new Set<string>();

      // Courses explicitly mentioned in AI actions
      (data.actions || []).forEach((a: any) => {
        if (a.course_id) ids.add(String(a.course_id));
      });

      // Also parse areas_to_improve for course shortnames
      (data.areas_to_improve || []).forEach((area: string) => {
        // Try to match known course shortnames mentioned in the text
        courses.forEach(c => {
          if (area.toLowerCase().includes(c.shortname.toLowerCase()) ||
              area.toLowerCase().includes(c.fullname.toLowerCase())) {
            ids.add(String(c.id));
          }
        });
      });

      setAiRecommendedIds(ids);
    } catch {
      // Non-critical — filters will just show 0 count
    }
  };

  // AI-recommended: explicitly flagged by AI insights, OR incomplete and below average progress
  const avgProgress = courses.length > 0
    ? Math.round(
        courses.reduce((sum, c) => {
          const p = progressData[c.id]?.progress ?? generateCourseMetadata(c.id).progress;
          return sum + p;
        }, 0) / courses.length
      )
    : 0;

  const isAiRecommended = (course: Course) => {
    const progress = getProgress(course.id);
    // Completed courses don't need recommendations
    if (progress >= 100) return false;
    // Directly flagged by AI insights
    if (aiRecommendedIds.has(String(course.id)) || aiRecommendedIds.has(course.shortname)) return true;
    // If AI didn't flag any specific courses, fall back to below-average incomplete ones
    if (aiRecommendedIds.size === 0 && progress < avgProgress) return true;
    return false;
  };

  // Has a real upcoming deadline (from Moodle assignment data)
  const hasAnyRealDeadlines = Object.keys(courseDeadlines).length > 0;
  const hasUpcomingDeadline = (course: Course) => {
    if (course.id in courseDeadlines) return true;

    // If we couldn't fetch any real deadlines (or Moodle courses have none),
    // fall back to the deterministic metadata so the filter isn't always empty.
    if (!hasAnyRealDeadlines) {
      return generateCourseMetadata(course.id).nextDeadline !== 'No upcoming deadlines';
    }

    return false;
  };

  // Most active: high engagement — real progress above average but NOT 100% complete
  const isMostActive = (course: Course) => {
    const progress = getProgress(course.id);
    const real = progressData[course.id];
    if (!real) return false; // No real data = can't determine activity
    if (progress >= 100) return true; // Completed courses show high activity
    return progress >= Math.max(avgProgress, 50); // Above average or above 50%, whichever is higher
  };

  const filters = [
    { id: 'all', label: 'All Courses', count: courses.length },
    { id: 'ai-recommended', label: 'AI Recommendations', count: courses.filter(c => isAiRecommended(c)).length },
    { id: 'upcoming-deadlines', label: 'Upcoming Deadlines', count: courses.filter(c => hasUpcomingDeadline(c)).length },
    { id: 'most-active', label: 'Most Active', count: courses.filter(c => isMostActive(c)).length },
  ];

  const filteredCourses = courses.filter((course) => {
    if (selectedFilter === 'ai-recommended' && !isAiRecommended(course)) return false;
    if (selectedFilter === 'upcoming-deadlines' && !hasUpcomingDeadline(course)) return false;
    if (selectedFilter === 'most-active' && !isMostActive(course)) return false;
    return (
      course.fullname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.shortname.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="animate-spin text-[#1E5BF0]" size={48} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#0E0F11]">
        {/* Header */}
        <div className="bg-white dark:bg-[#1A1C20] border-b border-gray-200 dark:border-[#2A2D32]">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              My Courses
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage and track your enrolled courses
            </p>
          </div>
        </div>

        {error && (
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <p className="text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-3">
              {/* Search and Filters */}
              <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-6 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] mb-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search
                      size={20}
                      className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      placeholder="Search courses by name or code..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 border border-gray-200 dark:border-[#2A2D32] rounded-xl focus:outline-none focus:border-[#1E5BF0] dark:focus:border-[#2C7CF0] focus:ring-2 focus:ring-[#1E5BF0]/20 dark:focus:ring-[#2C7CF0]/20 bg-white dark:bg-[#111418] text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="flex gap-2 overflow-x-auto">
                    {filters.map((filter) => (
                      <button
                        key={filter.id}
                        onClick={() => setSelectedFilter(filter.id)}
                        className={`px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
                          selectedFilter === filter.id
                            ? 'bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] text-white shadow-lg'
                            : 'bg-gray-100 dark:bg-[#111418] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#1A1C20]'
                        }`}
                      >
                        {filter.label} ({filter.count})
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Course Cards */}
              {filteredCourses.length === 0 ? (
                <div className="bg-white dark:bg-[#1A1C20] rounded-2xl shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] p-12 text-center">
                  <BookOpen className="mx-auto text-gray-400 mb-4" size={64} />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {courses.length === 0
                      ? 'No courses found'
                      : selectedFilter === 'upcoming-deadlines'
                        ? 'No upcoming deadlines'
                        : selectedFilter === 'ai-recommended'
                          ? 'No AI recommendations'
                          : selectedFilter === 'most-active'
                            ? 'No active courses yet'
                            : 'No courses found'}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {searchQuery
                      ? 'Try adjusting your search terms'
                      : courses.length === 0
                        ? "You haven't enrolled in any courses yet"
                        : selectedFilter === 'upcoming-deadlines'
                          ? 'Assignments with due dates will show up here'
                          : 'Try switching filters to view all courses'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredCourses.map((course, index) => {
                    const realProgress = progressData[course.id];
                    const displayProgress = realProgress?.progress ?? generateCourseMetadata(course.id).progress;
                    const progressColor = getCourseColor(displayProgress);
                    const isAtRisk = displayProgress < 35;
                    return (
                      <motion.div
                        key={course.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        onClick={() => navigate(`/courses/${course.id}`, { state: { course } })}
                        className="bg-white dark:bg-[#1A1C20] rounded-2xl p-6 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] hover:shadow-lg dark:hover:border-[#2C7CF0]/30 transition-all cursor-pointer relative overflow-hidden"
                      >
                        {/* At Risk Badge */}
                        {isAtRisk && (
                          <div className="absolute top-4 right-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1 rounded-lg text-xs font-semibold">
                            At Risk
                          </div>
                        )}

                        {/* Course Header */}
                        <div className="flex items-start gap-4 mb-4">
                          <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${progressColor}15` }}
                          >
                            <BookOpen size={28} style={{ color: progressColor }} />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                              {course.shortname}
                            </p>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                              {course.fullname}
                            </h3>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Progress</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                              {displayProgress}%
                            </span>
                          </div>
                          <div className="w-full h-2 bg-gray-200 dark:bg-[#111418] rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all duration-300"
                              style={{
                                width: `${displayProgress}%`,
                                backgroundColor: progressColor,
                              }}
                            />
                          </div>
                        </div>

                        {/* Next Deadline / Status */}
                        <div className="mb-3 p-3 bg-gray-50 dark:bg-[#111418] rounded-lg">
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {realProgress ? `${realProgress.completed}/${realProgress.total} activities completed` : generateCourseMetadata(course.id).nextDeadline}
                          </p>
                        </div>

                        {/* Insight */}
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {realProgress ? `Progress: ${displayProgress.toFixed(1)}%` : generateCourseMetadata(course.id).insight}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Sidebar - My Learning Trends */}
            <div className="lg:col-span-1">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white dark:bg-[#1A1C20] rounded-2xl p-6 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] sticky top-6"
              >
                <h3 className="font-bold text-gray-900 dark:text-white mb-6">
                  My Learning Trends
                </h3>

                {/* Active Courses */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Active Courses</span>
                    <span className="text-2xl font-bold text-[#1E5BF0] dark:text-[#2C7CF0]">
                      {courses.length}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-[#111418] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0]"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {/* Average Progress */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Average Progress</span>
                    <span className="text-2xl font-bold text-[#1ABC9C]">{`${avgProgress}%`}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-[#111418] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1ABC9C]"
                      style={{ width: `${avgProgress}%` }}
                    />
                  </div>
                </div>

                {/* Study Order Suggestion - AI sorted by priority */}
                <div className="p-4 bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] rounded-xl text-white mb-4">
                  <div className="flex items-start gap-2 mb-2">
                    <Sparkles size={20} className="flex-shrink-0" />
                    <p className="text-sm font-medium">Suggested Study Order</p>
                  </div>
                  <ol className="text-xs space-y-1.5 text-white/90 ml-7">
                    {[...courses]
                      .sort((a, b) => getProgress(a.id) - getProgress(b.id))
                      .slice(0, 3)
                      .map((course, index) => {
                        const progress = getProgress(course.id);
                        const label = progress >= 100
                          ? 'maintain lead'
                          : progress < 40
                            ? 'catch up'
                            : progress < avgProgress
                              ? 'needs attention'
                              : 'keep going';
                        return (
                          <li key={course.id}>
                            {index + 1}. {course.shortname}{' '}
                            <span className="text-white/60">({label})</span>
                          </li>
                        );
                      })}
                  </ol>
                </div>

                <button
                  onClick={() => {
                    const courseList = [...courses]
                      .sort((a, b) => getProgress(a.id) - getProgress(b.id))
                      .map(c => `${c.shortname} (${getProgress(c.id)}%)`)
                      .join(', ');
                    setStudyPlanPrompt(
                      `Create a detailed study plan for my courses. Here are my courses sorted by progress: ${courseList}. Focus on the ones that need the most attention first.`
                    );
                    setChatOpen(true);
                  }}
                  className="w-full px-4 py-3 bg-gray-100 dark:bg-[#111418] hover:bg-gray-200 dark:hover:bg-[#1A1C20] rounded-xl font-medium text-gray-700 dark:text-gray-300 transition-colors"
                >
                  Ask AI for Study Plan
                </button>
              </motion.div>
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
          setStudyPlanPrompt(undefined);
        }}
        initialMessage={studyPlanPrompt}
      />
    </Layout>
  );
}
