import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile, UserProfile } from '../services/userService';
import { getCourses, getCourseAssignments } from '../services/moodleService';
import { progressService, ProgressOverview } from '../services/progressService';
import Layout from '../components/Layout';
import { 
  BookOpen, 
  AlertCircle,
  Award,
  Brain,
  TrendingUp,
  TrendingDown,
  Zap,
  Calendar
} from 'lucide-react';

interface Course {
  id: number;
  fullname: string;
  shortname: string;
}

interface CourseAssignment {
  id: number;
  module_id: number;
  assignment_id?: number;
  name?: string;
  status?: string;
  grade?: number;
  gradeMax?: number;
  duedate?: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<CourseAssignment[]>([]);
  const [progressData, setProgressData] = useState<ProgressOverview[]>([]);
  const [averageGrade, setAverageGrade] = useState<number>(0);
  const [assignmentStats, setAssignmentStats] = useState<{ dueCount: number; doneCount: number; totalCount: number; nextDue?: number }>({ dueCount: 0, doneCount: 0, totalCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      // Load user profile from Firestore
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);

      // Load enrolled courses from Moodle via backend API
      try {
        const coursesData = await getCourses();
        const courseList = coursesData.courses || [];
        setCourses(courseList);

        // Load progress overview
        const progressOverview = await progressService.getProgressOverview();
        setProgressData(progressOverview);

        // Fetch all assignments concurrently for better UX
        const assignmentsResponses = await Promise.all(
          courseList.map((course: Course) =>
            getCourseAssignments(course.id).catch((err) => {
              console.error(`Failed to fetch assignments for course ${course.id}:`, err);
              return { assignments: [] } as { assignments: CourseAssignment[] };
            })
          )
        );

        const allAssignments: CourseAssignment[] = assignmentsResponses.flatMap((res) => res.assignments || []);
        setAssignments(allAssignments);

        // Calculate average grade from submitted assignments
        const gradedAssignments = allAssignments.filter((a) => a.grade !== undefined && a.grade !== null);
        if (gradedAssignments.length > 0) {
          const avgGrade = gradedAssignments.reduce((sum, a) => sum + (a.grade || 0), 0) / gradedAssignments.length;
          setAverageGrade(Math.round(avgGrade));
        } else {
          setAverageGrade(0);
        }

        // Compute assignment due and done stats
        const nowSec = Math.floor(Date.now() / 1000);
        const pending = allAssignments.filter((a) => (a.status || '').toLowerCase() !== 'submitted');
        const doneCount = allAssignments.filter((a) => (a.status || '').toLowerCase() === 'submitted').length;
        const dueWithDates = pending.filter((a) => typeof a.duedate === 'number');
        const nextDue = dueWithDates.sort((a, b) => (a.duedate || 0) - (b.duedate || 0))[0]?.duedate;
        const dueCount = pending.length; // includes overdue and upcoming
        setAssignmentStats({ dueCount, doneCount, totalCount: allAssignments.length, nextDue });
      } catch (err) {
        console.error('Failed to load courses:', err);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="w-full">
        {/* Top Section - Welcome & Stats */}
        <div className="bg-white dark:bg-gray-900 p-8 border-b border-gray-200 dark:border-[#2A2D32]">
          <div className="max-w-7xl mx-auto">
            {/* Welcome */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Welcome back, {user?.displayName || user?.email?.split('@')[0] || 'Student'} 👋
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Here's what's happening with your courses today
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-[#1A1C20] rounded-lg p-4 border border-gray-200 dark:border-[#2A2D32]">
                <div className="flex items-center gap-3 mb-2">
                  <BookOpen size={24} className="text-[#1E5BF0]" />
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {courses.length}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Courses Enrolled</p>
              </div>

              <div className="bg-gray-50 dark:bg-[#1A1C20] rounded-lg p-4 border border-gray-200 dark:border-[#2A2D32]">
                <div className="flex items-center gap-3 mb-2">
                  <AlertCircle size={24} className={assignmentStats.dueCount > 0 ? 'text-red-600' : 'text-green-600'} />
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {assignmentStats.dueCount > 0 
                      ? assignmentStats.dueCount 
                      : `${assignmentStats.doneCount}/${assignmentStats.totalCount}`}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {assignmentStats.dueCount > 0 ? 'Assignments Due' : 'Assignments Completed'}
                </p>
                {assignmentStats.dueCount > 0 && assignmentStats.nextDue && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Next due: {new Date((assignmentStats.nextDue || 0) * 1000).toLocaleDateString()}</p>
                )}
                <div className="mt-2">
                  <Link
                    to="/courses"
                    className="text-xs font-semibold text-[#1E5BF0] hover:underline"
                  >
                    View due assignments
                  </Link>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-[#1A1C20] rounded-lg p-4 border border-gray-200 dark:border-[#2A2D32]">
                <div className="flex items-center gap-3 mb-2">
                  <Award size={24} className="text-purple-600" />
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {averageGrade}%
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Quiz Average</p>
              </div>

              <div className="bg-gray-50 dark:bg-[#1A1C20] rounded-lg p-4 border border-gray-200 dark:border-[#2A2D32]">
                <div className="flex items-center gap-3 mb-2">
                  {(() => {
                    const avgProgress = progressData.length > 0 
                      ? Math.round(progressData.reduce((sum, p) => sum + p.progress, 0) / progressData.length)
                      : 0;
                    return avgProgress < 50 
                      ? <TrendingDown size={24} className="text-red-600" />
                      : <TrendingUp size={24} className="text-green-600" />;
                  })()}
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {progressData.length > 0 
                      ? Math.round(progressData.reduce((sum, p) => sum + p.progress, 0) / progressData.length)
                      : 0}%
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Average Progress</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* AI Insight Card */}
            <div className="bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] rounded-2xl p-6 text-white">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Zap size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-2">NeoBright AI Insight</h3>
                  <p className="text-white/90">
                    You're 80% done with this week's modules. Don't forget to complete the quiz for CSC121 before Friday! You're performing well in Database Systems - keep up the great work.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Actions & Upcoming Tasks */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Quick Actions */}
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <Link
                    to="/courses"
                    className="block p-4 bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-lg hover:border-[#1E5BF0] dark:hover:border-[#2C7CF0] transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BookOpen className="text-[#1E5BF0]" size={20} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">View Courses</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Browse your enrolled courses</p>
                      </div>
                    </div>
                  </Link>

                  <Link
                    to="/Courses"
                    className="block p-4 bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-lg hover:border-[#1E5BF0] dark:hover:border-[#2C7CF0] transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Award className="text-green-600" size={20} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">Assignments</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Submit and track assignments</p>
                      </div>
                    </div>
                  </Link>

                  <Link
                    to="/analytics"
                    className="block p-4 bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-lg hover:border-[#1E5BF0] dark:hover:border-[#2C7CF0] transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="text-purple-600" size={20} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">Progress Insights</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">View your learning analytics</p>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>

              {/* Upcoming Tasks */}
              <div className="lg:col-span-2">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Upcoming Tasks</h3>
                <div className="bg-white dark:bg-[#1A1C20] rounded-lg border border-gray-200 dark:border-[#2A2D32] divide-y divide-gray-200 dark:divide-[#2A2D32]">
                  {(() => {
                    const upcomingTasks = assignments
                      .filter((a) => (a.status || '').toLowerCase() !== 'submitted')
                      .sort((a, b) => (a.duedate || Infinity) - (b.duedate || Infinity))
                      .slice(0, 5);
                    
                    return upcomingTasks.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                        No upcoming assignments
                      </div>
                    ) : (
                      upcomingTasks
                      .map((task, idx) => {
                        const dueDate = task.duedate ? new Date((task.duedate || 0) * 1000) : null;
                        const now = new Date();
                        const isOverdue = dueDate && dueDate < now;
                        const daysUntil = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                        
                        let dueText = 'No due date';
                        if (isOverdue) {
                          dueText = 'OVERDUE';
                        } else if (daysUntil === 0) {
                          dueText = 'Due today';
                        } else if (daysUntil === 1) {
                          dueText = 'Due tomorrow';
                        } else if (daysUntil) {
                          dueText = `Due in ${daysUntil} days`;
                        }
                        
                        return (
                          <div key={idx} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#2A2D32] transition-colors">
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full ${isOverdue ? 'bg-red-500' : 'bg-[#1E5BF0]'}`}></div>
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">{task.name}</p>
                                <p className={`text-sm ${isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                                  {dueText}
                                </p>
                              </div>
                            </div>
                            <Calendar size={20} className={isOverdue ? 'text-red-500' : 'text-gray-400'} />
                          </div>
                        );
                      })
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
