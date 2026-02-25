import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { X, Loader2, CheckCircle2, XCircle, MinusCircle, Clock, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import quizService, { AttemptReview, Quiz } from '../services/quizService';

interface QuizReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  quiz: Quiz;
  attemptId: number;
}

const ReviewQuestionHtml = memo(function ReviewQuestionHtml({
  html,
  processHtml,
}: {
  html: string;
  processHtml: (html: string) => string;
}) {
  const processed = useMemo(() => processHtml(html), [html, processHtml]);
  const dangerous = useMemo(() => ({ __html: processed }), [processed]);
  return (
    <div
      className="quiz-review-html text-sm leading-relaxed"
      dangerouslySetInnerHTML={dangerous}
    />
  );
});

export default function QuizReviewModal({ isOpen, onClose, quiz, attemptId }: QuizReviewModalProps) {
  const [review, setReview] = useState<AttemptReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && attemptId) {
      loadReview();
    }
  }, [isOpen, attemptId]);

  const loadReview = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await quizService.getAttemptReview(quiz.id, attemptId);
      setReview(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load review');
    } finally {
      setLoading(false);
    }
  };

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'gradedright':
        return <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />;
      case 'gradedwrong':
        return <XCircle size={20} className="text-red-500 flex-shrink-0" />;
      case 'gradedpartial':
        return <MinusCircle size={20} className="text-yellow-500 flex-shrink-0" />;
      default:
        return <MinusCircle size={20} className="text-gray-400 flex-shrink-0" />;
    }
  };

  const getStateBadge = (state: string) => {
    switch (state) {
      case 'gradedright':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'gradedwrong':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'gradedpartial':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'gaveup':
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const stateLabel = (state: string) => {
    switch (state) {
      case 'gradedright': return 'Correct';
      case 'gradedwrong': return 'Incorrect';
      case 'gradedpartial': return 'Partial';
      case 'gaveup': return 'Not answered';
      case 'mangrright': return 'Correct';
      case 'mangrwrong': return 'Incorrect';
      case 'mangrpartial': return 'Partial';
      case 'needsgrading': return 'Pending';
      default: return state;
    }
  };

  const getBorderColor = (state: string) => {
    switch (state) {
      case 'gradedright':
      case 'mangrright':
        return 'border-l-green-500';
      case 'gradedwrong':
      case 'mangrwrong':
        return 'border-l-red-500';
      case 'gradedpartial':
      case 'mangrpartial':
        return 'border-l-yellow-500';
      default:
        return 'border-l-gray-300 dark:border-l-gray-600';
    }
  };

  // Parse grade info from additionaldata
  const gradeInfo = review?.additionaldata?.find(d => d.id === 'grade');
  const overallFeedback = review?.additionaldata?.find(d => d.id === 'feedback');

  const correctCount = review?.questions?.filter(q =>
    q.state === 'gradedright' || q.state === 'mangrright'
  ).length || 0;
  const wrongCount = review?.questions?.filter(q =>
    q.state === 'gradedwrong' || q.state === 'mangrwrong'
  ).length || 0;
  const totalQuestions = review?.questions?.length || 0;
  const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  // Format time taken
  const timeTaken = review?.attempt
    ? review.attempt.timefinish - review.attempt.timestart
    : 0;
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  // Strip Moodle-only navigation from review HTML.
  // Student UI should show comments/response history but must not navigate to Moodle.
  const processReviewHtml = useCallback((html: string): string => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Remove injected scripts.
      doc.querySelectorAll('script').forEach(s => s.remove());

      // Remove the "Make comment or override mark" section entirely.
      doc.querySelectorAll('.commentlink').forEach(el => el.remove());

      // Replace all anchors with spans (prevents navigation).
      doc.querySelectorAll('a').forEach((a) => {
        const span = doc.createElement('span');
        if (a.className) span.className = a.className;
        if (a.id) span.id = a.id;
        const title = a.getAttribute('title');
        if (title) span.setAttribute('title', title);
        span.textContent = a.textContent || '';
        a.replaceWith(span);
      });

      return doc.body.innerHTML;
    } catch {
      return html;
    }
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-[#1A1C20] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-gray-200 dark:border-[#2A2D32]">
              {/* Header — sticky */}
              <div className="sticky top-0 bg-white dark:bg-[#1A1C20] border-b border-gray-200 dark:border-[#2A2D32] px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1E5BF0] to-[#2C7CF0] flex items-center justify-center flex-shrink-0">
                    <Award size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Quiz Review</p>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{quiz.name}</h2>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-[#111418] rounded-xl transition-colors"
                >
                  <X size={20} className="text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="overflow-y-auto flex-1 px-6 py-6 space-y-5">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="animate-spin text-[#1E5BF0]" size={36} />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading review...</p>
                  </div>
                ) : error ? (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                  </div>
                ) : (
                  <>
                    {/* ── Score Summary Card ────────────────────────── */}
                    <div className="bg-gradient-to-br from-[#1E5BF0]/8 to-[#2C7CF0]/5 dark:from-[#1E5BF0]/12 dark:to-[#2C7CF0]/8 rounded-2xl p-5 border border-[#1E5BF0]/15">
                      <div className="flex items-center gap-5">
                        {/* Score ring */}
                        <div className="relative w-20 h-20 flex-shrink-0">
                          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6"
                              className="text-gray-200 dark:text-gray-700" />
                            <circle cx="40" cy="40" r="34" fill="none" strokeWidth="6" strokeLinecap="round"
                              stroke={scorePercent >= 70 ? '#22c55e' : scorePercent >= 40 ? '#f59e0b' : '#ef4444'}
                              strokeDasharray={`${2 * Math.PI * 34}`}
                              strokeDashoffset={`${2 * Math.PI * 34 * (1 - scorePercent / 100)}`}
                              style={{ transition: 'stroke-dashoffset 1s ease' }} />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-bold text-gray-900 dark:text-white">{scorePercent}%</span>
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            {gradeInfo?.content
                              ? gradeInfo.content.replace(/<[^>]*>/g, '')
                              : `${correctCount}/${totalQuestions}`}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <CheckCircle2 size={12} className="text-green-500" /> {correctCount} correct
                            </span>
                            <span className="flex items-center gap-1">
                              <XCircle size={12} className="text-red-500" /> {wrongCount} wrong
                            </span>
                            {totalQuestions - correctCount - wrongCount > 0 && (
                              <span className="flex items-center gap-1">
                                <MinusCircle size={12} className="text-gray-400" /> {totalQuestions - correctCount - wrongCount} other
                              </span>
                            )}
                            {timeTaken > 0 && (
                              <span className="flex items-center gap-1">
                                <Clock size={12} /> {formatDuration(timeTaken)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {overallFeedback?.content && (
                        <div
                          className="mt-4 pt-3 border-t border-[#1E5BF0]/15 text-sm text-gray-700 dark:text-gray-300"
                          dangerouslySetInnerHTML={{ __html: processReviewHtml(overallFeedback.content) }}
                        />
                      )}
                    </div>

                    {/* ── Questions ──────────────────────────────────── */}
                    <div className="space-y-3">
                      {review?.questions?.map((q, idx) => (
                        <motion.div
                          key={q.slot || idx}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className={`rounded-xl border border-l-4 overflow-hidden ${getBorderColor(q.state)} ${
                            q.state === 'gradedright' || q.state === 'mangrright'
                              ? 'border-green-200/60 dark:border-green-800/30 bg-white dark:bg-[#111418]'
                              : q.state === 'gradedwrong' || q.state === 'mangrwrong'
                              ? 'border-red-200/60 dark:border-red-800/30 bg-white dark:bg-[#111418]'
                              : 'border-gray-200 dark:border-[#2A2D32] bg-white dark:bg-[#111418]'
                          }`}
                        >
                          {/* Question header */}
                          <div className="flex items-center justify-between px-4 py-3 bg-gray-50/50 dark:bg-[#1A1C20]/50 border-b border-gray-100 dark:border-[#2A2D32]">
                            <div className="flex items-center gap-2.5">
                              {getStateIcon(q.state)}
                              <span className="font-semibold text-sm text-gray-900 dark:text-white">
                                Q{q.number || q.slot}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide ${getStateBadge(q.state)}`}>
                                {stateLabel(q.state)}
                              </span>
                            </div>
                            {q.mark !== undefined && q.maxmark !== undefined && (
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                                q.state === 'gradedright' || q.state === 'mangrright'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : q.state === 'gradedwrong' || q.state === 'mangrwrong'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                              }`}>
                                {q.mark ?? '0'} / {q.maxmark}
                              </span>
                            )}
                          </div>

                          {/* Question body */}
                          <div className="px-4 py-4">
                            <ReviewQuestionHtml html={q.html} processHtml={processReviewHtml} />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              {!loading && !error && (
                <div className="border-t border-gray-200 dark:border-[#2A2D32] px-6 py-3 flex justify-end flex-shrink-0 rounded-b-2xl bg-gray-50/50 dark:bg-[#111418]/50">
                  <button
                    onClick={onClose}
                    className="px-5 py-2 rounded-xl bg-[#1E5BF0] text-white text-sm font-semibold hover:bg-[#184AD0] transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </motion.div>

          {/* ── Comprehensive review styling ───────────────────────── */}
          <style>{`
            /* ── Base ────────────────────────────────────────────── */
            .quiz-review-html {
              color: #374151;
              line-height: 1.7;
            }
            .dark .quiz-review-html {
              color: #d1d5db;
            }

            /* Moodle a11y helpers (Bootstrap isn't loaded here) */
            .quiz-review-html .accesshide,
            .quiz-review-html .sr-only {
              position: absolute !important;
              width: 1px !important;
              height: 1px !important;
              padding: 0 !important;
              margin: -1px !important;
              overflow: hidden !important;
              clip: rect(0,0,0,0) !important;
              white-space: nowrap !important;
              border: 0 !important;
            }

            /* Ensure no navigation is possible from review HTML */
            .quiz-review-html a {
              pointer-events: none !important;
              color: inherit;
              text-decoration: none;
            }

            /* Comment container: keep layout tidy after stripping comment link */
            .quiz-review-html .comment {
              margin-top: 10px;
            }

            /* ── Question text ───────────────────────────────────── */
            .quiz-review-html .qtext {
              font-weight: 600;
              font-size: 0.95rem;
              margin-bottom: 12px;
              color: #111827;
            }
            .dark .quiz-review-html .qtext {
              color: #f3f4f6;
            }
            .quiz-review-html .qtext p {
              margin: 0 0 4px;
            }
            .quiz-review-html .formulation {
              margin-bottom: 4px;
            }

            /* ── Answer options ──────────────────────────────────── */
            .quiz-review-html .answer {
              display: flex;
              flex-direction: column;
              gap: 6px;
              margin-top: 4px;
            }
            .quiz-review-html .answer > div,
            .quiz-review-html .answer > label {
              display: flex;
              align-items: center;
              gap: 10px;
              padding: 10px 14px;
              border-radius: 10px;
              border: 1.5px solid #e5e7eb;
              background: #fafafa;
              transition: none;
              cursor: default;
            }
            .dark .quiz-review-html .answer > div,
            .dark .quiz-review-html .answer > label {
              border-color: #2A2D32;
              background: #1A1C20;
            }

            /* Correct answer highlight */
            .quiz-review-html .answer > div:has(input:checked).correct,
            .quiz-review-html .answer > div.correct:has(input:checked),
            .quiz-review-html .answer > div:has(input:checked) .correct,
            .quiz-review-html .answer > div:has(.text-success),
            .quiz-review-html .answer > div:has(.fa-check) {
              border-color: #22c55e;
              background: #f0fdf4;
            }
            .dark .quiz-review-html .answer > div:has(input:checked).correct,
            .dark .quiz-review-html .answer > div.correct:has(input:checked),
            .dark .quiz-review-html .answer > div:has(.text-success),
            .dark .quiz-review-html .answer > div:has(.fa-check) {
              border-color: #166534;
              background: rgba(22, 163, 74, 0.1);
            }

            /* Wrong answer highlight */
            .quiz-review-html .answer > div:has(input:checked).incorrect,
            .quiz-review-html .answer > div.incorrect:has(input:checked),
            .quiz-review-html .answer > div:has(.text-danger),
            .quiz-review-html .answer > div:has(.fa-times) {
              border-color: #ef4444;
              background: #fef2f2;
            }
            .dark .quiz-review-html .answer > div:has(input:checked).incorrect,
            .dark .quiz-review-html .answer > div.incorrect:has(input:checked),
            .dark .quiz-review-html .answer > div:has(.text-danger),
            .dark .quiz-review-html .answer > div:has(.fa-times) {
              border-color: #991b1b;
              background: rgba(239, 68, 68, 0.1);
            }

            /* Selected answer indicator */
            .quiz-review-html .answer > div:has(input:checked),
            .quiz-review-html .answer > label:has(input:checked) {
              border-color: #3b82f6;
              background: #eff6ff;
            }
            .dark .quiz-review-html .answer > div:has(input:checked),
            .dark .quiz-review-html .answer > label:has(input:checked) {
              border-color: #1d4ed8;
              background: rgba(59, 130, 246, 0.1);
            }

            /* ── Radio & checkbox (read-only) ────────────────────── */
            .quiz-review-html input[type="radio"],
            .quiz-review-html input[type="checkbox"] {
              accent-color: #1E5BF0;
              width: 18px;
              height: 18px;
              pointer-events: none;
              flex-shrink: 0;
            }
            .quiz-review-html input, .quiz-review-html select, .quiz-review-html textarea {
              pointer-events: none;
            }
            .quiz-review-html label {
              cursor: default;
              display: flex;
              align-items: center;
              gap: 10px;
              flex: 1;
              font-size: 0.9rem;
              color: #374151;
            }
            .dark .quiz-review-html label {
              color: #d1d5db;
            }

            /* ── Text inputs (read-only styling) ─────────────────── */
            .quiz-review-html input[type="text"],
            .quiz-review-html input[type="number"] {
              border: 1.5px solid #e5e7eb;
              border-radius: 8px;
              padding: 6px 10px;
              font-size: 0.9rem;
              background: #fafafa;
              pointer-events: none;
            }
            .dark .quiz-review-html input[type="text"],
            .dark .quiz-review-html input[type="number"] {
              background: #1A1C20;
              border-color: #2A2D32;
              color: #e5e7eb;
            }

            /* ── Correct / Incorrect text markers ────────────────── */
            .quiz-review-html .correct {
              color: #16a34a;
              font-weight: 600;
            }
            .quiz-review-html .incorrect {
              color: #dc2626;
              font-weight: 600;
            }

            /* ── Right answer block ──────────────────────────────── */
            .quiz-review-html .rightanswer {
              background: #f0fdf4;
              border-left: 3px solid #22c55e;
              padding: 10px 14px;
              border-radius: 0 8px 8px 0;
              margin-top: 10px;
              font-size: 0.85rem;
              color: #15803d;
              font-weight: 500;
            }
            .dark .quiz-review-html .rightanswer {
              background: rgba(22, 163, 74, 0.08);
              color: #86efac;
            }

            /* ── General feedback ────────────────────────────────── */
            .quiz-review-html .generalfeedback {
              background: #eff6ff;
              border-left: 3px solid #3b82f6;
              padding: 10px 14px;
              border-radius: 0 8px 8px 0;
              margin-top: 10px;
              font-size: 0.85rem;
              color: #1d4ed8;
            }
            .dark .quiz-review-html .generalfeedback {
              background: rgba(59, 130, 246, 0.08);
              color: #93c5fd;
            }

            /* ── Specific feedback ───────────────────────────────── */
            .quiz-review-html .specificfeedback {
              background: #fefce8;
              border-left: 3px solid #eab308;
              padding: 10px 14px;
              border-radius: 0 8px 8px 0;
              margin-top: 10px;
              font-size: 0.85rem;
              color: #854d0e;
            }
            .dark .quiz-review-html .specificfeedback {
              background: rgba(234, 179, 8, 0.08);
              color: #fde047;
            }

            /* ── Outcome / grade ─────────────────────────────────── */
            .quiz-review-html .outcome,
            .quiz-review-html .grade {
              font-size: 0.85rem;
              margin-top: 8px;
              padding: 6px 10px;
              background: #f3f4f6;
              border-radius: 6px;
              color: #4b5563;
            }
            .dark .quiz-review-html .outcome,
            .dark .quiz-review-html .grade {
              background: #1A1C20;
              color: #9ca3af;
            }

            /* ── Correctness icon overrides (Moodle icons) ───────── */
            .quiz-review-html .questioncorrectnessicon {
              width: 16px;
              height: 16px;
              vertical-align: middle;
              margin-right: 4px;
            }

            /* ── "Clear my choice" / Flag — hide in review ───────── */
            .quiz-review-html .qtype_multichoice_clearchoice,
            .quiz-review-html .questionflag {
              display: none !important;
            }

            /* ── Moodle control buttons — hide in review ─────────── */
            .quiz-review-html .im-controls,
            .quiz-review-html input[type="hidden"] {
              display: none !important;
            }

            /* ── Select / dropdown (read-only) ───────────────────── */
            .quiz-review-html select {
              border: 1.5px solid #e5e7eb;
              border-radius: 8px;
              padding: 6px 10px;
              font-size: 0.9rem;
              background: #fafafa;
              pointer-events: none;
            }
            .dark .quiz-review-html select {
              background: #1A1C20;
              border-color: #2A2D32;
              color: #e5e7eb;
            }

            /* ── Table styling (matching quizzes) ────────────────── */
            .quiz-review-html table {
              width: 100%;
              border-collapse: collapse;
              font-size: 0.85rem;
              margin-top: 8px;
            }
            .quiz-review-html th, .quiz-review-html td {
              padding: 8px 10px;
              border: 1px solid #e5e7eb;
              text-align: left;
            }
            .dark .quiz-review-html th, .dark .quiz-review-html td {
              border-color: #2A2D32;
            }
            .quiz-review-html th {
              background: #f3f4f6;
              font-weight: 600;
            }
            .dark .quiz-review-html th {
              background: #1A1C20;
            }

            /* ── Images ──────────────────────────────────────────── */
            .quiz-review-html img {
              max-width: 100%;
              height: auto;
              border-radius: 6px;
              margin: 4px 0;
            }

            /* ── Prompt / instructions ───────────────────────────── */
            .quiz-review-html .prompt {
              font-size: 0.78rem;
              color: #9ca3af;
              margin-top: 4px;
            }

            /* ── Ablock (Moodle answer wrapper) ──────────────────── */
            .quiz-review-html .ablock {
              margin-top: 8px;
            }
          `}</style>
        </>
      )}
    </AnimatePresence>
  );
}
