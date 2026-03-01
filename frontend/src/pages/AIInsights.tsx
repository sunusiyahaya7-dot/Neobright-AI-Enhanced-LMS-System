import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';
import { Lightbulb, Target, AlertTriangle, CheckCircle, Loader2, RefreshCw, Clock, Database } from 'lucide-react';

interface AiActionItem {
  title: string;
  description: string;
  deadline_days?: number;
  course_id?: string;
  priority: 'low' | 'medium' | 'high';
}

interface AiInsights {
  summary: string;
  strengths: string[];
  areas_to_improve: string[];
  actions: AiActionItem[];
  risk_level: 'low' | 'medium' | 'high';
  confidence_score: number;
  generated_at: string;
  cached?: boolean;
  cache_expires_at?: string;
}

export default function AIInsights() {
  const [insights, setInsights] = useState<AiInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      
      // Add force=true param when manually refreshing
      const url = forceRefresh ? '/ai/insights?force=true' : '/ai/insights';
      const response = await api.get<AiInsights>(url);
      setInsights(response.data);
    } catch (err: any) {
      console.error('Failed to load AI insights:', err);
      const message = err?.response?.data?.error || 'Failed to generate insights';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInsights(false); // Load cached on mount
  }, []);

  const handleRefresh = () => {
    fetchInsights(true); // Force regeneration
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getRiskBadge = (risk: string) => {
    const colors = {
      low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return colors[risk as keyof typeof colors] || colors.medium;
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl">
              <Lightbulb className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                AI Insights
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Personalized recommendations to improve your learning
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading || refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-[#1E5BF0] text-white rounded-lg hover:bg-[#1a4fd0] transition-colors disabled:opacity-50"
            title="Generate fresh insights (uses AI tokens)"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Generating...' : 'Regenerate'}
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-[#1E5BF0]" />
            <p className="text-gray-600 dark:text-gray-400">Generating your personalized insights...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={() => fetchInsights(false)}
              className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : insights ? (
          <>
            {/* Summary Card */}
            <div className="bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] rounded-xl p-6 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold mb-2">Summary</h2>
                  <p className="text-white/90">{insights.summary}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${getRiskBadge(insights.risk_level)}`}>
                  {insights.risk_level} Risk
                </span>
              </div>
              <div className="mt-4 flex items-center gap-4 text-sm text-white/70">
                <span>Confidence: {Math.round(insights.confidence_score * 100)}%</span>
                <span>•</span>
                <span>Generated: {getTimeAgo(insights.generated_at)}</span>
                {insights.cached && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Database className="w-3 h-3" />
                      Cached
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Strengths & Areas to Improve */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Strengths */}
              <div className="bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Strengths</h2>
                </div>
                <ul className="space-y-3">
                  {insights.strengths.map((strength, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300">{strength}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Areas to Improve */}
              <div className="bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-5 h-5 text-amber-500" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Areas to Improve</h2>
                </div>
                <ul className="space-y-3">
                  {insights.areas_to_improve.map((area, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300">{area}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Action Items */}
            <div className="bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Recommended Actions
              </h2>
              <div className="space-y-4">
                {insights.actions.map((action, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 dark:border-[#2A2D32] rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-gray-900 dark:text-white">{action.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getPriorityColor(action.priority)}`}>
                        {action.priority}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {action.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
                      {action.deadline_days && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {action.deadline_days} days
                        </span>
                      )}
                      {action.course_id && (
                        <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                          {action.course_id}
                        </span>
                      )}
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
