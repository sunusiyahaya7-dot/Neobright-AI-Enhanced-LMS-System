import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import ModuleDetailsModal from '../components/ModuleDetailsModal';
import AssignmentDetailsModal from '../components/AssignmentDetailsModal';
import { ProgressBar } from '../components/ProgressBar';
import { MarkAsDoneButton } from '../components/MarkAsDoneButton';
import { getCourseContents, getCourseAssignments } from '../services/moodleService';
import { progressService, CourseProgress } from '../services/progressService';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Sparkles,
  Download,
  TrendingUp,
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

  useEffect(() => {
    if (id) {
      fetchCourseContent();
    }
  }, [id]);

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

  const handleActivityComplete = async (activityId: number) => {
    try {
      const success = await progressService.markActivityComplete(Number(id), activityId);
      if (success) {
        // Update completions state
        setCompletions(prev => ({
          ...prev,
          [String(activityId)]: true
        }));
        // Refresh backend-computed progress (includes Moodle + user completions)
        fetchCourseProgress();
      }
    } catch (err) {
      console.error('Failed to mark activity as complete:', err);
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

  // Calculate activities done count (including both modules and assignments)
  const activitiesDone = useMemo(() => {
    const modulesDone = allModules.filter(m => completions[String(m.id)]).length;
    const assignmentsDone = assignments.filter(a => 
      completions[String(a.module_id || a.id)] || a.status === 'submitted'
    ).length;
    return modulesDone + assignmentsDone;
  }, [completions, allModules, assignments]);

  const totalActivities = useMemo(() => {
    return allModules.length + assignments.length;
  }, [allModules, assignments]);

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

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
                    <p className="text-lg font-bold text-[#1ABC9C]">{progress.progress.toFixed(1)}%</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{progress.completed}/{progress.total} completed</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Activities: {activitiesDone}/{totalActivities}</p>
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
                        { id: 'quizzes', label: 'Quizzes' },
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
                  {activeTab === 'assignments' ? (
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
                  ) : activeTab !== 'modules' ? (
                    <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-8 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32]">
                      <p className="text-gray-700 dark:text-gray-300">
                        {activeTab} view coming next.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* AI Auto Insights */}
                      <div className="bg-gradient-to-r from-[#1E5BF0]/10 to-[#2C7CF0]/10 dark:from-[#1E5BF0]/15 dark:to-[#2C7CF0]/15 rounded-2xl p-6 border border-[#1E5BF0]/10 dark:border-[#2C7CF0]/20 mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles className="text-[#1E5BF0]" size={18} />
                          <h3 className="font-semibold text-gray-900 dark:text-white">AI Auto Insights</h3>
                        </div>
                        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                          <li>• Modules and files are loaded from Moodle</li>
                          <li>• Next: connect processed materials from Firestore</li>
                        </ul>
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
                                                {processed ? ' • 💡 AI-ready' : ''}
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
                                                💡 AI Summaries
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
                      <p className="font-bold text-gray-900 dark:text-white">Brighten AI</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Course Assistant</p>
                    </div>
                  </div>

                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">QUICK QUERIES</p>
                  <div className="space-y-3">
                    {[
                      { title: 'Summarize this lecture', subtitle: 'Get a quick recap of key points' },
                      { title: 'Explain Topic 1 in simpler terms', subtitle: 'Break down complex concepts' },
                      { title: 'Generate quiz from this module', subtitle: 'Test your understanding' },
                      { title: 'Show key points of Lab', subtitle: 'Highlight important takeaways' },
                    ].map((q) => (
                      <button
                        key={q.title}
                        className="w-full text-left p-4 rounded-xl bg-gray-50 dark:bg-[#111418] hover:bg-gray-100 dark:hover:bg-[#151A20] border border-gray-200 dark:border-[#2A2D32] transition-colors"
                      >
                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{q.title}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{q.subtitle}</p>
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 p-4 rounded-2xl bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] text-white">
                    <p className="text-xs font-semibold mb-1">Study Tip</p>
                    <p className="text-sm text-white/90">
                      Once Firestore processed materials are connected, this panel can suggest what to study next.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
    </Layout>
  );
}
