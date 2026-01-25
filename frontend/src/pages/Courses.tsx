import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCourses } from '../services/moodleService';
import { progressService, ProgressOverview } from '../services/progressService';
import Layout from '../components/Layout';
import {
  BookOpen,
  Clock,
  AlertCircle,
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
  const [progressLoading, setProgressLoading] = useState(false);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const data = await getCourses();
      setCourses(data.courses || []);
      
      // Fetch progress data
      fetchProgress();
    } catch (err: any) {
      console.error('Failed to fetch courses:', err);
      setError(err.response?.data?.error || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const fetchProgress = async () => {
    try {
      setProgressLoading(true);
      const overview = await progressService.getProgressOverview();
      const progressMap: Record<number, ProgressOverview> = {};
      overview.forEach(p => {
        progressMap[p.courseId] = p;
      });
      setProgressData(progressMap);
    } catch (err) {
      console.error('Failed to fetch progress overview:', err);
      // Continue without progress data
    } finally {
      setProgressLoading(false);
    }
  };

  const getCourseColor = (progress: number) => {
    if (progress >= 75) return '#1ABC9C';
    if (progress >= 50) return '#1E5BF0';
    return '#FF6B6B';
  };

  const filters = [
    { id: 'all', label: 'All Courses', count: courses.length },
    { id: 'at-risk', label: 'At Risk', count: courses.filter(c => {
      const progress = progressData[c.id]?.progress ?? generateCourseMetadata(c.id).progress;
      return progress < 35;
    }).length },
  ];

  const filteredCourses = courses.filter((course) => {
    if (selectedFilter !== 'all') {
      const progress = progressData[course.id]?.progress ?? generateCourseMetadata(course.id).progress;
      if (selectedFilter === 'at-risk' && progress >= 35) return false;
    }
    return (
      course.fullname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.shortname.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const avgProgress = courses.length > 0
    ? Math.round(
        courses.reduce((sum, c) => {
          const progress = progressData[c.id]?.progress ?? generateCourseMetadata(c.id).progress;
          return sum + progress;
        }, 0) / courses.length
      )
    : 0;

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
                    No courses found
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {searchQuery ? 'Try adjusting your search terms' : "You haven't enrolled in any courses yet"}
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

                {/* Study Order Suggestion */}
                <div className="p-4 bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] rounded-xl text-white mb-4">
                  <div className="flex items-start gap-2 mb-2">
                    <Sparkles size={20} className="flex-shrink-0" />
                    <p className="text-sm font-medium">Suggested Study Order</p>
                  </div>
                  <ol className="text-xs space-y-1 text-white/90 ml-7">
                    {filteredCourses.slice(0, 3).map((course, index) => (
                      <li key={course.id}>
                        {index + 1}. {course.shortname}
                      </li>
                    ))}
                  </ol>
                </div>

                <button className="w-full px-4 py-3 bg-gray-100 dark:bg-[#111418] hover:bg-gray-200 dark:hover:bg-[#1A1C20] rounded-xl font-medium text-gray-700 dark:text-gray-300 transition-colors">
                  Ask AI for Study Plan
                </button>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
