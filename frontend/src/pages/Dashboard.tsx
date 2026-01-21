import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile, UserProfile } from '../services/userService';
import api from '../api/client';
import Layout from '../components/Layout';
import { 
  BookOpen, 
  Clock,
  Award,
  Brain,
  TrendingUp,
  Zap,
  MessageSquare
} from 'lucide-react';

interface Course {
  id: number;
  fullname: string;
  shortname: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      // Load user profile
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);

      // Load enrolled courses
      try {
        const response = await api.get('/enrollment/courses');
        setCourses(response.data.courses || []);
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
                  <Clock size={24} className="text-blue-600" />
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">3</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Assignments Due</p>
              </div>

              <div className="bg-gray-50 dark:bg-[#1A1C20] rounded-lg p-4 border border-gray-200 dark:border-[#2A2D32]">
                <div className="flex items-center gap-3 mb-2">
                  <Award size={24} className="text-purple-600" />
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">85%</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Quiz Average</p>
              </div>

              <div className="bg-gray-50 dark:bg-[#1A1C20] rounded-lg p-4 border border-gray-200 dark:border-[#2A2D32]">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp size={24} className="text-green-600" />
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">80%</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Progress</p>
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
                    to="/assignments"
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
                  {[
                    { title: 'CSC121 Programming Assignment', due: 'Due in 2 days' },
                    { title: 'Database Systems Quiz', due: 'Due Friday' },
                    { title: 'Network Security Reading', due: 'Due next week' },
                  ].map((task, idx) => (
                    <div key={idx} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#2A2D32] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-[#1E5BF0]"></div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{task.title}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{task.due}</p>
                        </div>
                      </div>
                      <Calendar size={20} className="text-gray-400" />
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

// Import Calendar icon
import { Calendar } from 'lucide-react';
