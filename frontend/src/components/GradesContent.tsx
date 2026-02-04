import { useEffect, useState } from 'react';
import { gradeCacheService } from '../services/gradeCacheService';
import { AlertCircle, BookOpen, Loader2, TrendingUp, TrendingDown } from 'lucide-react';

interface Grade {
  grade: number | null;
  gradeMax: number;
  feedback: string | null;
  gradeddate: number | null;
  assignmentName?: string;
}

interface GradesData {
  success: boolean;
  course_id: number;
  count: number;
  grades: Record<string, Grade>;
}

interface GradesContentProps {
  courseId: number;
}

// Utility function to strip HTML tags from text
const stripHtmlTags = (html: string): string => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
};

// Get trending icon based on average grade percentage
const getTrendingIcon = (percentage: number) => {
  if (percentage >= 75) {
    return { Icon: TrendingUp, color: 'text-green-500' };
  } else if (percentage >= 50) {
    return { Icon: TrendingUp, color: 'text-yellow-500' };
  } else {
    return { Icon: TrendingDown, color: 'text-red-500' };
  }
};

export default function GradesContent({ courseId }: GradesContentProps) {
  const [grades, setGrades] = useState<GradesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    // Auto-sync grades on component mount
    syncAndFetchGrades();
  }, [courseId]);

  const syncAndFetchGrades = async () => {
    try {
      setLoading(true);
      setError('');
      // Auto-sync first
      await gradeCacheService.syncCourseGrades(courseId);
      // Then fetch the updated grades
      const response = await gradeCacheService.getAllCachedGrades(courseId);
      setGrades(response);
    } catch (err) {
      console.error('Failed to sync/fetch grades:', err);
      // Fallback to just fetching cached grades if sync fails
      try {
        const response = await gradeCacheService.getAllCachedGrades(courseId);
        setGrades(response);
      } catch (fetchErr) {
        setError('Unable to load grades. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchGrades = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await gradeCacheService.getAllCachedGrades(courseId);
      setGrades(response);
    } catch (err) {
      console.error('Failed to fetch grades:', err);
      setError('Unable to load grades. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    try {
      setSyncing(true);
      setError('');
      const response = await gradeCacheService.syncCourseGrades(courseId);
      if (response.success) {
        await fetchGrades();
      } else {
        setError(response.message || 'Failed to sync grades');
      }
    } catch (err) {
      console.error('Failed to sync grades:', err);
      setError('Failed to sync grades.');
      await fetchGrades();
    } finally {
      setSyncing(false);
    }
  };

  const calculateAverageGrade = (): { average: number; total: number } => {
    if (!grades || !grades.grades || Object.keys(grades.grades).length === 0) {
      return { average: 0, total: 0 };
    }

    const gradedItems = Object.values(grades.grades).filter(
      (g) => g.grade !== null && g.grade !== undefined
    );

    if (gradedItems.length === 0) {
      return { average: 0, total: Object.keys(grades.grades).length };
    }

    const totalPercentage = gradedItems.reduce((sum, g) => {
      const percentage = (g.grade !== null ? (g.grade / g.gradeMax) * 100 : 0);
      return sum + percentage;
    }, 0);

    return {
      average: totalPercentage / gradedItems.length,
      total: Object.keys(grades.grades).length,
    };
  };

  const stats = calculateAverageGrade();
  const gradesList = grades?.grades ? Object.entries(grades.grades) : [];
  const gradedCount = gradesList.filter(([, g]) => g.grade !== null).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Loader2 className="text-[#1E5BF0] animate-spin mx-auto mb-4" size={32} />
          <p className="text-gray-600 dark:text-gray-400">Loading grades...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 flex items-start gap-4">
        <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={20} />
        <div>
          <h3 className="font-semibold text-red-900 dark:text-red-300">Error Loading Grades</h3>
          <p className="text-red-800 dark:text-red-400 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (gradesList.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-12 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] text-center">
        <BookOpen className="mx-auto text-gray-400 mb-4" size={48} />
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          No grades yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Complete assignments to see your grades here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Button */}
      <div className="flex justify-end">
        <button
          onClick={handleManualSync}
          disabled={syncing}
          className="px-6 py-2 bg-[#1E5BF0] text-white rounded-xl font-medium hover:bg-[#1847BC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {syncing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Syncing...
            </>
          ) : (
            'Refresh'
          )}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Average Grade Card */}
        <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-6 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                Average Grade
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-[#1E5BF0]">
                  {stats.average.toFixed(1)}%
                </span>
              </div>
            </div>
            {(() => {
              const { Icon, color } = getTrendingIcon(stats.average);
              return (
                <div className={`p-4 rounded-2xl ${stats.average >= 75 ? 'bg-green-500/10' : stats.average >= 50 ? 'bg-yellow-500/10' : 'bg-red-500/10'}`}>
                  <Icon className={color} size={24} />
                </div>
              );
            })()}
          </div>
        </div>

        {/* Graded Items Card */}
        <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-6 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32]">
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
            Graded Items
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900 dark:text-white">
              {gradedCount}
            </span>
            <span className="text-gray-600 dark:text-gray-400 text-sm">
              of {stats.total}
            </span>
          </div>
          <div className="mt-3 w-full bg-gray-200 dark:bg-[#2A2D32] rounded-full h-2 overflow-hidden">
            <div
              className="bg-[#1E5BF0] h-full transition-all duration-300"
              style={{
                width: stats.total > 0 ? `${(gradedCount / stats.total) * 100}%` : '0%',
              }}
            />
          </div>
        </div>

        {/* Total Items Card */}
        <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-6 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32]">
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
            Total Items
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900 dark:text-white">
              {stats.total}
            </span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
            {stats.total - gradedCount} {stats.total - gradedCount === 1 ? 'item' : 'items'} pending
          </p>
        </div>
      </div>

      {/* Grades Table */}
      <div className="bg-white dark:bg-[#1A1C20] rounded-2xl shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#2A2D32] bg-gray-50 dark:bg-[#111418]">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Assignment
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Grade
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Percentage
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Graded Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Feedback
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#2A2D32]">
              {gradesList.map(([assignmentId, grade]) => {
                const percentage =
                  grade.grade !== null
                    ? ((grade.grade / grade.gradeMax) * 100).toFixed(1)
                    : null;
                const gradedDate = grade.gradeddate
                  ? new Date(grade.gradeddate * 1000).toLocaleDateString()
                  : null;

                return (
                  <tr
                    key={assignmentId}
                    className="hover:bg-gray-50 dark:hover:bg-[#111418] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {grade.assignmentName || `Assignment ${assignmentId}`}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      {grade.grade !== null ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-lg bg-[#1E5BF0]/10 dark:bg-[#1E5BF0]/20 text-[#1E5BF0] dark:text-[#4A9FFF] font-semibold text-sm">
                          {grade.grade} / {grade.gradeMax}
                        </span>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400 italic">
                          Not graded
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {percentage !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-gray-200 dark:bg-[#2A2D32] rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                Number(percentage) >= 70
                                  ? 'bg-green-500'
                                  : Number(percentage) >= 50
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span
                            className={`text-sm font-semibold ${
                              Number(percentage) >= 70
                                ? 'text-green-600 dark:text-green-400'
                                : Number(percentage) >= 50
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {percentage}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {gradedDate || '—'}
                    </td>
                    <td className="px-6 py-4">
                      {grade.feedback ? (
                        <div className="max-w-xs">
                          <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                            {stripHtmlTags(grade.feedback)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
