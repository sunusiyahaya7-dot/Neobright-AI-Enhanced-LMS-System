import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Layout from '../components/Layout';
import ModuleDetailsModal from '../components/ModuleDetailsModal';
import AssignmentDetailsModal from '../components/AssignmentDetailsModal';
import QuizAttemptView from '../components/QuizAttemptView';
import QuizReviewModal from '../components/QuizReviewModal';
import quizService, { Quiz } from '../services/quizService';
import { MarkAsDoneButton } from '../components/MarkAsDoneButton';
import { getCourseContents, getCourseAssignments } from '../services/moodleService';
import { progressService, CourseProgress } from '../services/progressService';
import api from '../api/client';
import GradesContent from '../components/GradesContent';
import AIChatPanel from '../components/AIChatPanel';

import {
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Sparkles,
  Download,
  TrendingUp,
  RefreshCw,
  Clock,
  Play,
  Eye,
  Trophy,
  RotateCcw,
  Send,
  CheckCircle2,
} from 'lucide-react';

interface CourseSummary {
  id: number;
  fullname: string;
  shortname: string;
}

interface ModuleFile {
  filename?: string;
  fileurl?: string;
  proxy_url?: string;
  mimetype?: string;
  filesize?: number;
}

interface CourseModule {
  id: number;
  name?: string;
  modname?: string;
  description?: string;
  files: ModuleFile[];
}

interface CourseAssignment {
  id: number;
  module_id: number;
  assignment_id?: number;
  name?: string;
  description?: string;
  intro_files?: ModuleFile[];
  duedate?: number;
  cutoffdate?: number;
  allowsubmissionsfromdate?: number;
  status?: string;
  section_name?: string;
  submitted_at?: string;
}

interface CourseSection {
  section_id?: number;
  section_name?: string;
  summary?: string;
  modules: CourseModule[];
}

interface ProcessedModule {
  summaries?: Array<{ content: string; generated_at: string }>;
  extracted_text?: string;
  ai_insights?: string[];
}

export default function CourseContent() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const routedCourse = (location.state as any)?.course as CourseSummary | undefined;

  const [activeTab, setActiveTab] = useState<'modules' | 'assignments' | 'quizzes' | 'grades'>('modules');
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [assignments, setAssignments] = useState<CourseAssignment[]>([]);
  const [processedMap, setProcessedMap] = useState<Record<string, ProcessedModule>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [completions, setCompletions] = useState<Record<string, boolean>>({});

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [selectedModule, setSelectedModule] = useState<{ module: CourseModule; sectionName?: string } | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<CourseAssignment | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrompt, setChatPrompt] = useState<string | undefined>(undefined);
  const [courseInsights, setCourseInsights] = useState<{ insights: string[]; study_tip: string } | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);

  // Quiz state
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizzesLoading, setQuizzesLoading] = useState(false);
  const [activeQuizAttempt, setActiveQuizAttempt] = useState<{ quiz: Quiz; attemptId: number } | null>(null);
  const [reviewAttempt, setReviewAttempt] = useState<{ quiz: Quiz; attemptId: number } | null>(null);
  const [quizStartConfirm, setQuizStartConfirm] = useState<Quiz | null>(null);
  const [startingQuiz, setStartingQuiz] = useState(false);
  

  useEffect(() => {
    if (id) {
      fetchCourseContent();
      fetchCourseInsights();
      fetchQuizzes();
    }
  }, [id]);

  // Fetch quizzes for this course
  const fetchQuizzes = async () => {
    try {
      setQuizzesLoading(true);
      const data = await quizService.getCourseQuizzes(Number(id));
      setQuizzes(data);
    } catch (err) {
      console.error('Failed to fetch quizzes:', err);
    } finally {
      setQuizzesLoading(false);
    }
  };

  const handleStartQuiz = (quiz: Quiz) => {
    // If there's an in-progress attempt, resume directly — no confirmation needed
    if (quiz.hasInProgress && quiz.inProgressAttemptId) {
      setActiveQuizAttempt({ quiz, attemptId: quiz.inProgressAttemptId });
      return;
    }
    // Show confirmation before starting a new attempt
    setQuizStartConfirm(quiz);
  };

  const confirmStartQuiz = async () => {
    if (!quizStartConfirm) return;
    const quiz = quizStartConfirm;
    try {
      setStartingQuiz(true);
      const attempt = await quizService.startAttempt(quiz.id);
      setActiveQuizAttempt({ quiz, attemptId: attempt.id });
      setQuizStartConfirm(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to start quiz';
      alert(msg);
    } finally {
      setStartingQuiz(false);
    }
  };

  const handleQuizFinished = async () => {
    const quiz = activeQuizAttempt?.quiz;
    setActiveQuizAttempt(null);
    fetchQuizzes(); // Refresh quiz list to show updated attempts

    // Mark quiz activity as complete & refresh progress (best-effort)
    if (quiz?.coursemodule && id) {
      try {
        await progressService.markActivityComplete(Number(id), quiz.coursemodule);
      } catch (err) {
        console.error('Failed to mark quiz complete:', err);
      }
      // Refresh progress bar + completion checkmarks
      try {
        await Promise.all([
          fetchCourseProgress(),
          fetchCompletions(),
        ]);
      } catch (err) {
        console.error('Failed to refresh progress after quiz:', err);
      }
    }
  };

  // Fetch AI course insights (cached — 6hr TTL)
  const fetchCourseInsights = async (force = false) => {
    try {
      setInsightsLoading(true);
      const res = await api.get(`/ai/courses/${id}/insights${force ? '?force=true' : ''}`);
      setCourseInsights(res.data);
    } catch {
      // Non-critical — show fallback
      setCourseInsights(null);
    } finally {
      setInsightsLoading(false);
    }
  };

  const fetchCourseContent = async () => {
    try {
      setLoading(true);
      const [materialsData, assignmentsData] = await Promise.all([
        getCourseContents(Number(id)),
        getCourseAssignments(Number(id)).catch((err) => {
          console.error('Failed to fetch assignments:', err);
          return { assignments: [] };
        })
      ]);

      console.log('Assignments data received:', assignmentsData);

      const rawSections: CourseSection[] = materialsData?.moodle_sections || [];
      const processed: Record<string, ProcessedModule> = materialsData?.processed || {};
      const courseAssignments: CourseAssignment[] = assignmentsData?.assignments || [];

      console.log('Course assignments parsed:', courseAssignments);

      setSections(rawSections);
      setAssignments(courseAssignments);
      setProcessedMap(processed);

      // Default: expand the first section that has modules.
      const first = rawSections.find((s) => (s.modules || []).length > 0);
      if (first) {
        setOpenSections({ [String(first.section_id ?? 0)]: true });
      }

      // Fetch progress
      fetchCourseProgress();
      
      // Fetch activity completions
      fetchCompletions();
    } catch (err: any) {
      console.error('Failed to fetch course content:', err);
      setError(err.response?.data?.error || 'Failed to load course content');
    } finally {
      setLoading(false);
    }
  };

  const fetchCourseProgress = async () => {
    try {
      setProgressLoading(true);
      const progressData = await progressService.getCourseProgress(Number(id));
      setProgress(progressData);
    } catch (err) {
      console.error('Failed to fetch course progress:', err);
      // Don't show error to user, just leave progress empty
    } finally {
      setProgressLoading(false);
    }
  };

  const fetchCompletions = async () => {
    try {
      const completionsData = await progressService.getCourseCompletions(Number(id));
      setCompletions(completionsData);
    } catch (err) {
      console.error('Failed to fetch completions:', err);
      // Continue without completions data
    }
  };

  const handleActivityComplete = async () => {
    // Refresh both progress and completions from Moodle
    try {
      await Promise.all([
        fetchCourseProgress(),
        fetchCompletions()
      ]);
    } catch (err) {
      console.error('Failed to refresh progress:', err);
    }
  };

  const courseTitle = routedCourse?.fullname || `Course ${id}`;
  const courseCode = routedCourse?.shortname || '';

  const allModules = useMemo(() => {
    const modules: CourseModule[] = [];
    for (const section of sections) {
      for (const module of section.modules || []) {
        modules.push(module);
      }
    }
    return modules;
  }, [sections]);

  const totalFiles = useMemo(() => {
    return allModules.reduce((sum, m) => sum + (m.files?.length || 0), 0);
  }, [allModules]);

  // Progress now comes from backend (Moodle native data only)
  const computedProgressPercent = progress ? progress.progress : 0;

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  // Open chat with a specific prompt
  const askAI = (prompt: string) => {
    setChatPrompt(prompt);
    setChatOpen(true);
  };

  // Build dynamic quick queries from actual course data
  const quickQueries = useMemo(() => {
    // Skip generic sections like "General" — find a real topic section
    const genericNames = ['general', 'announcements', 'news', ''];
    const topicSection = sections.find(
      s => (s.modules || []).length > 0 && !genericNames.includes((s.section_name || '').toLowerCase().trim())
    );
    const sectionName = topicSection?.section_name || 'Topic 1';

    // Find a specific module (lecture, resource, lab, etc.)
    const allModulesFlat = sections.flatMap(s => s.modules || []);
    const contentModule = allModulesFlat.find(
      m => m.modname === 'resource' || m.modname === 'page' || m.modname === 'assign'
    );
    const moduleName = contentModule?.name || 'the latest module';

    return [
      { title: 'Summarize this lecture', subtitle: 'Get a quick recap of key points', prompt: `Summarize the key concepts from ${courseTitle}. Cover the main topics and keep it concise and easy to understand.` },
      { title: `Explain ${sectionName} in simpler terms`, subtitle: 'Break down complex concepts', prompt: `Explain the main concepts from "${sectionName}" in ${courseTitle} in simpler terms, as if explaining to a beginner.` },
      { title: 'Generate quiz from this module', subtitle: 'Test your understanding', prompt: `Create a short quiz (3-5 questions) based on the content of ${courseTitle} to test my understanding. Include multiple choice and short answer questions.` },
      { title: `Show key points of ${moduleName}`, subtitle: 'Highlight important takeaways', prompt: `What are the key takeaways from "${moduleName}" in ${courseTitle}? List the most important points I should remember.` },
    ];
  }, [sections, courseTitle]);

  return (
    <Layout>
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#0E0F11]">
        {/* Header */}
        <div className="bg-white dark:bg-[#1A1C20] border-b border-gray-200 dark:border-[#2A2D32]">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <Link to="/courses" className="text-sm text-[#1E5BF0] hover:underline">
              ← Back to My Courses
            </Link>
            <div className="mt-2 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                  {courseTitle}
                </h1>
                {courseCode ? (
                  <p className="text-gray-600 dark:text-gray-400 mt-1">{courseCode}</p>
                ) : null}
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {allModules.length} modules • {totalFiles} files
                </p>
              </div>

              <div className="flex flex-col items-end gap-4 min-w-fit">
                <button className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-[#111418] text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#1A1C20] transition-colors">
                  Focus Mode
                </button>
                {progressLoading && !progress ? (
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
                  </div>
                ) : progress ? (
                  <div className="text-right">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp size={16} className="text-[#1ABC9C]" />
                      <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold">Course Progress</p>
                    </div>
                    <p className="text-lg font-bold text-[#1ABC9C]">{computedProgressPercent}%</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Activities: {progress?.completed || 0}/{progress?.total || 0}</p>
                  </div>
                ) : (
                  <div className="text-right">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Progress</p>
                    <p className="text-lg font-bold text-gray-300 dark:text-gray-600">—</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-[#1E5BF0]" size={48} />
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <p className="text-red-700 dark:text-red-300">{error}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main */}
              <div className="lg:col-span-2">
                {/* Tabs */}
                <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-3 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32]">
                  <div className="flex gap-2 overflow-x-auto">
                    {(
                      [
                        { id: 'modules', label: `Modules (${sections.length})` },
                        { id: 'assignments', label: `Assignments (${assignments.length})` },
                        { id: 'quizzes', label: `Quizzes (${quizzes.length})` },
                        { id: 'grades', label: 'Grades' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-all ${
                          activeTab === tab.id
                            ? 'bg-white dark:bg-[#111418] shadow border border-gray-200 dark:border-[#2A2D32] text-[#1E5BF0]'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#111418]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div className="mt-6">
                  {activeTab === 'grades' ? (
                    <GradesContent courseId={Number(id)} />
                  ) : activeTab === 'assignments' ? (
                    <div className="space-y-4">
                      {assignments.length === 0 ? (
                        <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-10 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] text-center">
                          <FileText className="mx-auto text-gray-400" size={48} />
                          <h4 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                            No assignments
                          </h4>
                          <p className="mt-2 text-gray-600 dark:text-gray-400">
                            This course has no assignments yet.
                          </p>
                        </div>
                      ) : (
                        assignments.map((assignment) => (
                          <div
                            key={assignment.id}
                            onClick={() => setSelectedAssignment(assignment)}
                            className="bg-white dark:bg-[#1A1C20] rounded-2xl p-6 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] hover:border-[#1E5BF0] dark:hover:border-[#2C7CF0] hover:shadow-md transition-all cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                  {assignment.name}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                  {assignment.section_name}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="px-3 py-1 bg-[#1E5BF0]/10 text-[#1E5BF0] dark:bg-[#1E5BF0]/20 dark:text-[#4A9FFF] text-xs font-semibold rounded-lg">
                                  {assignment.status || 'Not submitted'}
                                </span>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <MarkAsDoneButton
                                    activityId={assignment.module_id || assignment.id}
                                    courseId={Number(id)}
                                    isComplete={completions[String(assignment.module_id || assignment.id)] || assignment.status === 'submitted'}
                                    onComplete={handleActivityComplete}
                                    size="sm"
                                  />
                                </div>
                              </div>
                            </div>
                            {assignment.duedate && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
                                Due: {new Date(assignment.duedate * 1000).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  ) : activeTab === 'quizzes' ? (
                    activeQuizAttempt ? (
                      <QuizAttemptView
                        quiz={activeQuizAttempt.quiz}
                        attemptId={activeQuizAttempt.attemptId}
                        onFinish={handleQuizFinished}
                        onCancel={() => { setActiveQuizAttempt(null); fetchQuizzes(); }}
                      />
                    ) : quizzesLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="animate-spin text-[#1E5BF0]" size={40} />
                      </div>
                    ) : quizzes.length === 0 ? (
                      <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-10 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] text-center">
                        <FileText className="mx-auto text-gray-400" size={48} />
                        <h4 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No quizzes</h4>
                        <p className="mt-2 text-gray-600 dark:text-gray-400">This course has no quizzes yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {quizzes.map((quiz) => {
                          const isOpen = quiz.timeopen === 0 || quiz.timeopen * 1000 <= Date.now();
                          const isClosed = quiz.timeclose !== 0 && quiz.timeclose * 1000 < Date.now();
                          const hasFinished = quiz.finishedAttempts > 0;
                          const canStartNew = isOpen && !isClosed && (quiz.maxattempts === 0 || quiz.finishedAttempts < quiz.maxattempts);
                          const hasActiveInProgress = quiz.hasInProgress && !quiz.timeExpired;
                          const hasExpiredInProgress = quiz.hasInProgress && quiz.timeExpired;
                          const maxAttemptsReached = quiz.maxattempts > 0 && quiz.finishedAttempts >= quiz.maxattempts;

                          return (
                            <motion.div
                              key={quiz.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="bg-white dark:bg-[#1A1C20] rounded-2xl shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] hover:border-[#1E5BF0]/40 dark:hover:border-[#2C7CF0]/40 hover:shadow-md transition-all overflow-hidden"
                            >
                              {/* Quiz card main content */}
                              <div className="p-5">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h3 className="text-base font-bold text-gray-900 dark:text-white">{quiz.name}</h3>
                                      {/* Status badges */}
                                      {hasActiveInProgress && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[11px] font-bold rounded-md uppercase tracking-wide">
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                          In Progress
                                        </span>
                                      )}
                                      {hasExpiredInProgress && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[11px] font-bold rounded-md uppercase tracking-wide">
                                          Time Expired
                                        </span>
                                      )}
                                      {maxAttemptsReached && !hasActiveInProgress && !hasExpiredInProgress && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[11px] font-bold rounded-md uppercase tracking-wide">
                                          <CheckCircle2 size={10} /> Completed
                                        </span>
                                      )}
                                      {isClosed && !hasActiveInProgress && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 text-[11px] font-bold rounded-md uppercase tracking-wide">
                                          Closed
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                                      {quiz.timelimit > 0 && (
                                        <span className="flex items-center gap-1">
                                          <Clock size={11} /> {Math.floor(quiz.timelimit / 60)} min
                                        </span>
                                      )}
                                      <span>Max: {quiz.grade} pts</span>
                                      <span>
                                        {quiz.finishedAttempts} / {quiz.maxattempts > 0 ? quiz.maxattempts : '∞'} attempts
                                      </span>
                                      {quiz.bestGrade !== null && (
                                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                                          <Trophy size={11} /> Best: {quiz.bestGrade}/{quiz.grade}
                                        </span>
                                      )}
                                    </div>

                                    {quiz.intro && (
                                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                                        {quiz.intro.replace(/<[^>]*>/g, '')}
                                      </p>
                                    )}
                                  </div>

                                  {/* Action buttons */}
                                  <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                                    {/* Resume — in-progress attempt */}
                                    {hasActiveInProgress ? (
                                      <button
                                        onClick={() => setActiveQuizAttempt({ quiz, attemptId: quiz.inProgressAttemptId! })}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm"
                                      >
                                        <RotateCcw size={14} /> Resume
                                      </button>
                                    ) : hasExpiredInProgress ? (
                                      <button
                                        onClick={async () => {
                                          try {
                                            await quizService.submitAttempt(quiz.id, quiz.inProgressAttemptId!, true);
                                            fetchQuizzes();
                                          } catch (err) {
                                            console.error('Failed to submit expired attempt:', err);
                                            fetchQuizzes();
                                          }
                                        }}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white text-sm font-semibold hover:from-red-600 hover:to-rose-600 transition-all shadow-sm"
                                      >
                                        <Send size={14} /> Submit Expired
                                      </button>
                                    ) : (
                                      <>
                                        {/* Review button (if has finished attempts) */}
                                        {hasFinished && (
                                          <button
                                            onClick={() => setReviewAttempt({ quiz, attemptId: quiz.lastFinishedAttemptId! })}
                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-100 dark:bg-[#111418] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#1E2025] transition-all text-sm font-semibold border border-gray-200 dark:border-[#2A2D32]"
                                          >
                                            <Eye size={14} /> Review
                                          </button>
                                        )}
                                        {/* Start / Retry button */}
                                        {canStartNew && !isClosed && (
                                          <button
                                            onClick={() => handleStartQuiz(quiz)}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] text-white text-sm font-semibold hover:from-[#184AD0] hover:to-[#2468D0] transition-all shadow-sm"
                                          >
                                            <Play size={14} /> {hasFinished ? 'Retry' : 'Start Quiz'}
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Attempt History — collapsible bottom section */}
                              {quiz.finishedAttempts > 0 && (
                                <div className="px-5 pb-4 pt-0">
                                  <div className="pt-3 border-t border-gray-100 dark:border-[#2A2D32]">
                                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">Attempt History</p>
                                    <QuizAttemptHistory quiz={quiz} onReview={(attemptId) => setReviewAttempt({ quiz, attemptId })} />
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <>
                      {/* AI Auto Insights */}
                      <div className="bg-gradient-to-r from-[#1E5BF0]/10 to-[#2C7CF0]/10 dark:from-[#1E5BF0]/15 dark:to-[#2C7CF0]/15 rounded-2xl p-6 border border-[#1E5BF0]/10 dark:border-[#2C7CF0]/20 mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Sparkles className="text-[#1E5BF0]" size={18} />
                            <h3 className="font-semibold text-gray-900 dark:text-white">AI Auto Insights</h3>
                          </div>
                          <button
                            onClick={() => fetchCourseInsights(true)}
                            disabled={insightsLoading}
                            className="p-1.5 rounded-lg hover:bg-[#1E5BF0]/10 dark:hover:bg-[#1E5BF0]/20 transition-colors disabled:opacity-50"
                            title="Regenerate AI insights"
                          >
                            <RefreshCw size={16} className={`text-[#1E5BF0] ${insightsLoading ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                        {insightsLoading ? (
                          <div className="space-y-2">
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/4" />
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3" />
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/2" />
                          </div>
                        ) : courseInsights?.insights?.length ? (
                          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                            {courseInsights.insights.map((insight, idx) => (
                              <li key={idx}>• {insight}</li>
                            ))}
                          </ul>
                        ) : (
                          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                            <li>• Modules and files are loaded from Moodle</li>
                            <li>• AI insights will appear here once generated</li>
                          </ul>
                        )}
                      </div>

                      {/* Sections / Modules */}
                      <div className="space-y-4">
                        {sections.length === 0 ? (
                          <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-10 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] text-center">
                            <FileText className="mx-auto text-gray-400" size={48} />
                            <h4 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                              No modules found
                            </h4>
                            <p className="mt-2 text-gray-600 dark:text-gray-400">
                              This course has no visible contents.
                            </p>
                          </div>
                        ) : (
                          sections.map((section) => {
                            const sid = String(section.section_id ?? 0);
                            const isOpen = !!openSections[sid];
                            const moduleCount = (section.modules || []).length;
                            return (
                              <div
                                key={sid}
                                className="bg-white dark:bg-[#1A1C20] rounded-2xl shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32]"
                              >
                                <button
                                  onClick={() => toggleSection(sid)}
                                  className="w-full flex items-center justify-between p-5"
                                >
                                  <div className="text-left">
                                    <p className="font-semibold text-gray-900 dark:text-white">
                                      {section.section_name || 'Untitled section'}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      {moduleCount} modules
                                    </p>
                                  </div>
                                  {isOpen ? (
                                    <ChevronDown className="text-gray-500" size={18} />
                                  ) : (
                                    <ChevronRight className="text-gray-500" size={18} />
                                  )}
                                </button>

                                {isOpen ? (
                                  <div className="px-5 pb-5 space-y-3">
                                    {(section.modules || []).map((mod) => {
                                      const processed = processedMap[String(mod.id)];
                                      return (
                                        <div
                                          key={mod.id}
                                          onClick={() => setSelectedModule({ module: mod, sectionName: section.section_name })}
                                          className="bg-gray-50 dark:bg-[#111418] rounded-xl p-4 border border-gray-200 dark:border-[#2A2D32] hover:border-[#1E5BF0] dark:hover:border-[#2C7CF0] hover:shadow-md transition-all cursor-pointer"
                                        >
                                          <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0 flex-1">
                                              <p className="font-medium text-gray-900 dark:text-white truncate hover:text-[#1E5BF0]">
                                                {mod.name || 'Untitled module'}
                                              </p>
                                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                {mod.modname || 'resource'} • {(mod.files || []).length} files
                                                {processed ? ' •  AI-ready' : ''}
                                              </p>
                                            </div>
                                            <div onClick={(e) => e.stopPropagation()}>
                                              <MarkAsDoneButton
                                                activityId={mod.id}
                                                courseId={Number(id)}
                                                isComplete={completions[String(mod.id)] || false}
                                                onComplete={handleActivityComplete}
                                                size="sm"
                                              />
                                            </div>
                                          </div>

                                          {/* Moodle Files - Show preview without opening modal */}
                                          {(mod.files || []).length > 0 && (mod.files || []).length <= 2 ? (
                                            <div className="mt-3 space-y-2">
                                              {mod.files.map((f, idx) => (
                                                <div
                                                  key={`${mod.id}-${idx}`}
                                                  className="flex items-center justify-between gap-3 bg-white dark:bg-[#1A1C20] rounded-lg px-3 py-2 border border-gray-200 dark:border-[#2A2D32]"
                                                >
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <FileText size={16} className="text-[#1E5BF0] flex-shrink-0" />
                                                    <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
                                                      {f.filename || 'File'}
                                                    </span>
                                                  </div>

                                                  {(f.proxy_url || f.fileurl) ? (
                                                    <a
                                                      href={f.proxy_url || f.fileurl}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1E5BF0] text-white text-sm hover:bg-[#184AD0] transition-colors flex-shrink-0"
                                                    >
                                                      <Download size={14} />
                                                      Open
                                                  </a>
                                                ) : null}
                                              </div>
                                            ))}
                                          </div>
                                        ) : null}

                                          {/* Processed Materials (Summaries/AI Insights) */}
                                          {processed && (processed.summaries?.length || 0) > 0 ? (
                                            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-[#2A2D32]">
                                              <p className="text-xs font-semibold text-[#1E5BF0] mb-2 flex items-center gap-1">
                                                AI Summaries
                                              </p>
                                              <div className="space-y-2">
                                                {processed.summaries?.slice(0, 2).map((s, idx) => (
                                                  <div
                                                    key={idx}
                                                    className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-[#1A1C20] rounded px-3 py-2 line-clamp-2"
                                                  >
                                                    {s.content || 'Summary available'}
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : null}

                                {/* Ask AI about this topic button */}
                                {isOpen && (section.modules || []).length > 0 && (
                                  <div className="px-5 pb-5">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        askAI(`Explain the key concepts from "${section.section_name || 'this topic'}" in ${courseTitle}. Break it down clearly and highlight what I should focus on.`);
                                      }}
                                      className="w-full py-3 rounded-xl bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] text-white font-medium text-sm hover:from-[#184AD0] hover:to-[#2468D0] transition-all flex items-center justify-center gap-2"
                                    >
                                      <Sparkles size={16} />
                                      Ask NeoBright AI about this topic
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Right Panel */}
              <div className="lg:col-span-1">
                <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-6 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] sticky top-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] flex items-center justify-center text-white font-bold">
                      ✦
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">NeoBright AI</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Course Assistant</p>
                    </div>
                  </div>

                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">QUICK QUERIES</p>
                  <div className="space-y-3">
                    {quickQueries.map((q) => (
                      <button
                        key={q.title}
                        onClick={() => askAI(q.prompt)}
                        className="w-full text-left p-4 rounded-xl bg-gray-50 dark:bg-[#111418] hover:bg-gray-100 dark:hover:bg-[#151A20] border border-gray-200 dark:border-[#2A2D32] transition-colors"
                      >
                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{q.title}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{q.subtitle}</p>
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 p-4 rounded-2xl bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] text-white">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">💡</span>
                      <p className="text-xs font-semibold">Study Tip</p>
                    </div>
                    <p className="text-sm text-white/90">
                      {courseInsights?.study_tip || 'Loading your personalized study tip...'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
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
              courseId={Number(id)}
              initialMessage={chatPrompt}
              initialMessageMode="draft"
            />
            

      {/* Module Details Modal */}
      {selectedModule && (
        <ModuleDetailsModal
          isOpen={!!selectedModule}
          onClose={() => setSelectedModule(null)}
          module={selectedModule.module}
          sectionName={selectedModule.sectionName}
        />
      )}

      {/* Assignment Details Modal */}
      {selectedAssignment && (
        <AssignmentDetailsModal
          isOpen={!!selectedAssignment}
          onClose={() => setSelectedAssignment(null)}
          assignment={selectedAssignment}
          courseId={Number(id)}
          onSubmitSuccess={() => {
            // Refresh assignments after submission
            fetchCourseContent();
            setSelectedAssignment(null);
          }}
        />
      )}

      {/* Quiz Review Modal */}
      {reviewAttempt && (
        <QuizReviewModal
          isOpen={!!reviewAttempt}
          onClose={() => setReviewAttempt(null)}
          quiz={reviewAttempt.quiz}
          attemptId={reviewAttempt.attemptId}
        />
      )}

      {/* Quiz Start Confirmation Dialog */}
      {quizStartConfirm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => !startingQuiz && setQuizStartConfirm(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white dark:bg-[#1A1C20] rounded-2xl p-6 shadow-2xl max-w-sm w-full border border-gray-200 dark:border-[#2A2D32]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#1E5BF0]/10 flex items-center justify-center">
                  <Play size={20} className="text-[#1E5BF0]" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Start Quiz?</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                You are about to start <strong>{quizStartConfirm.name}</strong>.
              </p>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 mb-6">
                {quizStartConfirm.timelimit > 0 && (
                  <p className="flex items-center gap-1"><Clock size={12} /> Time limit: {Math.floor(quizStartConfirm.timelimit / 60)} minutes</p>
                )}
                <p>Maximum grade: {quizStartConfirm.grade}</p>
                {quizStartConfirm.maxattempts > 0 && (
                  <p>Attempts remaining: {quizStartConfirm.maxattempts - quizStartConfirm.finishedAttempts}</p>
                )}
              </div>
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => setQuizStartConfirm(null)}
                  disabled={startingQuiz}
                  className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-[#111418] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#1E2025] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmStartQuiz}
                  disabled={startingQuiz}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] text-white hover:from-[#184AD0] hover:to-[#2468D0] transition-all font-semibold disabled:opacity-50"
                >
                  {startingQuiz ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {startingQuiz ? 'Starting...' : 'Start Quiz'}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </Layout>
  );
}

// ── Inline sub-component: QuizAttemptHistory ─────────────────────────────
function QuizAttemptHistory({ quiz, onReview }: { quiz: Quiz; onReview: (attemptId: number) => void }) {
  const [attempts, setAttempts] = useState<import('../services/quizService').QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    quizService.getQuizAttempts(quiz.id).then((data) => {
      setAttempts(data.filter((a) => a.state === 'finished'));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [quiz.id]);

  if (loading) return <Loader2 className="animate-spin text-gray-400" size={16} />;
  if (attempts.length === 0) return <p className="text-xs text-gray-400">No finished attempts.</p>;

  return (
    <div className="space-y-1.5">
      {attempts.map((a) => (
        <div key={a.id} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="text-gray-700 dark:text-gray-300">Attempt {a.attempt}</span>
            <span className="text-gray-400">
              {new Date(a.timefinish * 1000).toLocaleDateString()} {new Date(a.timefinish * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              {a.sumgrades !== null ? `${a.sumgrades}/${quiz.grade}` : '—'}
            </span>
          </div>
          <button
            onClick={() => onReview(a.id)}
            className="flex items-center gap-1 text-[#1E5BF0] hover:text-[#184AD0] font-semibold"
          >
            <Eye size={12} /> Review
          </button>
        </div>
      ))}
    </div>
  );
}


