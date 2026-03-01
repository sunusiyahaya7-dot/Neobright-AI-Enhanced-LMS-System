import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { aiContextService, AIContext } from '../services/aiContextService';
import { Brain, TrendingUp, AlertTriangle, BookOpen, Loader2 } from 'lucide-react';

export default function AIDashboard() {
  const [context, setContext] = useState<AIContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContext = async () => {
      try {
        setLoading(true);
        const data = await aiContextService.getContext();
        setContext(data);
      } catch (err) {
        console.error('Failed to load AI context:', err);
        setError('Failed to load AI dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchContext();
  }, []);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-500 bg-green-50 dark:bg-green-900/20';
      case 'medium': return 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
      case 'high': return 'text-red-500 bg-red-50 dark:bg-red-900/20';
      default: return 'text-gray-500 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-[#1E5BF0] to-[#2C7CF0] rounded-xl">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              AI Dashboard
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your personalized learning insights powered by NeoBright AI
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-[#1E5BF0]" />
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : context ? (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="w-5 h-5 text-[#1E5BF0]" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Overall Progress</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {context.analytics.overallProgress}%
                </p>
              </div>

              <div className="bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <BookOpen className="w-5 h-5 text-[#1E5BF0]" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Enrolled Courses</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {context.courses.length}
                </p>
              </div>

              <div className="bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="w-5 h-5 text-[#1E5BF0]" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Completion Rate</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {Math.round(context.analytics.completionRate * 100)}%
                </p>
              </div>

              <div className="bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <AlertTriangle className={`w-5 h-5 ${
                    context.analytics.riskLevel === 'low' ? 'text-green-500' :
                    context.analytics.riskLevel === 'medium' ? 'text-yellow-500' : 'text-red-500'
                  }`} />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Risk Level</span>
                </div>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium capitalize ${getRiskColor(context.analytics.riskLevel)}`}>
                  {context.analytics.riskLevel}
                </span>
              </div>
            </div>

            {/* Courses Overview */}
            <div className="bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Course Progress
              </h2>
              <div className="space-y-4">
                {context.courses.map((course) => (
                  <div key={course.id} className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {course.name}
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {course.progress}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-[#1E5BF0] h-2 rounded-full transition-all"
                          style={{ width: `${course.progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>{course.completedActivities}/{course.totalActivities} activities</span>
                        {course.averageScore !== null && (
                          <span>Avg: {course.averageScore}%</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Layout>
  );
}
