import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Clock, Loader2, Send, Save, AlertTriangle, LogOut, ShieldCheck } from 'lucide-react';
import quizService, { QuizQuestion, QuizAttempt, Quiz } from '../services/quizService';

interface QuizAttemptViewProps {
  quiz: Quiz;
  attemptId: number;
  onFinish: () => void;
  onCancel: () => void;
}

const MoodleQuestionHtml = memo(function MoodleQuestionHtml({
  html,
  processHtml,
}: {
  html: string;
  processHtml: (html: string) => string;
}) {
  const processed = useMemo(() => processHtml(html), [html, processHtml]);
  const dangerous = useMemo(() => ({ __html: processed }), [processed]);

  return <div className="quiz-question-html" dangerouslySetInnerHTML={dangerous} />;
});

export default function QuizAttemptView({ quiz, attemptId, onFinish, onCancel }: QuizAttemptViewProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [nextPage, setNextPage] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSubmittedRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const handleSubmitRef = useRef<(timeup?: boolean) => void>(() => {});

  const isAttemptAlreadyFinishedError = (err: any): boolean => {
    const msg = String(
      err?.response?.data?.error ??
      err?.response?.data?.message ??
      err?.message ??
      err
    ).toLowerCase();
    return msg.includes('already been finished');
  };

  // ── Load page of questions ─────────────────────────────────────────────
  const loadPage = useCallback(async (page: number) => {
    try {
      setLoading(true);
      setError('');
      const data = await quizService.getAttemptData(quiz.id, attemptId, page);
      setQuestions(data.questions || []);
      setAttempt(data.attempt || null);
      setNextPage(data.nextpage);
      setCurrentPage(page);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  }, [quiz.id, attemptId]);

  useEffect(() => { loadPage(0); }, [loadPage]);

  // ── Browser beforeunload guard ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ── Intercept browser back button ──────────────────────────────────────
  useEffect(() => {
    // Push a dummy state so pressing "back" triggers popstate instead of navigating
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      // Re-push so the user stays on the page
      window.history.pushState(null, '', window.location.href);
      setShowExitConfirm(true);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ── Timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!attempt || !quiz.timelimit) return;

    autoSubmittedRef.current = false;
    submitInFlightRef.current = false;

    const start = Number((attempt as any).timestart);
    const limit = Number(quiz.timelimit);
    if (!Number.isFinite(start) || !Number.isFinite(limit) || limit <= 0) {
      setTimeLeft(null);
      return;
    }

    const elapsed = Math.floor(Date.now() / 1000) - start;
    const remaining = limit - elapsed;
    const initial = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
    setTimeLeft(initial);

    if (initial <= 0 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      // allow first render to paint before navigating away
      setTimeout(() => handleSubmitRef.current(true), 0);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null) return null;
        const safePrev = Number(prev);
        if (!Number.isFinite(safePrev)) return 0;
        if (safePrev <= 0) return 0;
        if (safePrev <= 1) {
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            handleSubmitRef.current(true);
          }
          return 0;
        }
        return safePrev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [attempt, quiz.timelimit]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Collect answers from rendered HTML forms ───────────────────────────
  const collectAnswers = (): Array<{ name: string; value: string }> => {
    if (!formRef.current) return [];
    const inputs = formRef.current.querySelectorAll('input, select, textarea');
    const data: Array<{ name: string; value: string }> = [];
    const seen = new Set<string>();

    inputs.forEach((el) => {
      const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const name = input.name;
      if (!name || seen.has(name)) return;

      if (input.type === 'radio') {
        if ((input as HTMLInputElement).checked) {
          data.push({ name, value: input.value });
          seen.add(name);
        }
      } else if (input.type === 'checkbox') {
        if ((input as HTMLInputElement).checked) {
          data.push({ name, value: input.value });
          seen.add(name);
        }
      } else {
        data.push({ name, value: input.value });
        seen.add(name);
      }
    });

    return data;
  };

  const handleSave = async () => {
    const answers = collectAnswers();
    if (answers.length === 0) return;
    try {
      setSaving(true);
      await quizService.saveAttempt(quiz.id, attemptId, answers);
    } catch (err) {
      // If time expired and Moodle already finished the attempt, exit cleanly.
      if (isAttemptAlreadyFinishedError(err)) {
        onFinish();
        return;
      }
      console.error('Failed to save answers:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (timeup = false) => {
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    try {
      setSubmitting(true);
      const answers = collectAnswers();
      if (answers.length > 0) {
        try {
          await quizService.saveAttempt(quiz.id, attemptId, answers);
        } catch (err) {
          // Moodle can auto-finish on time expiry; treat this as successful completion.
          if (isAttemptAlreadyFinishedError(err)) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            onFinish();
            return;
          }
          throw err;
        }
      }
      try {
        await quizService.submitAttempt(quiz.id, attemptId, timeup);
      } catch (err) {
        if (isAttemptAlreadyFinishedError(err)) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          onFinish();
          return;
        }
        throw err;
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      onFinish();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to submit quiz');
      setSubmitting(false);
      submitInFlightRef.current = false;
    }
  };

  // Keep latest handler available for the timer callback.
  handleSubmitRef.current = handleSubmit;

  const handleNextPage = async () => {
    await handleSave();
    if (nextPage >= 0) {
      loadPage(nextPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      handleSave();
      loadPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Exit: save answers first, then leave
  const handleExitConfirmed = async () => {
    try {
      await handleSave();
    } catch { /* best-effort */ }
    setShowExitConfirm(false);
    onCancel();
  };

  // ── Preprocess Moodle HTML before render ─────────────────────────────
  // Moodle quiz HTML has structural issues that break in React:
  //  1. <script> tags (RequireJS / AMD modules) – must be stripped
  //  2. Answer text is in <div data-region="answer-label">, not <label>
  //     so clicking text doesn't natively select the radio
  //  3. "Clear my choice" radio (value=-1, checked by default) steals selection
  //     and its .sr-only class doesn't exist in our app
  // We fix these BEFORE rendering via DOMParser (immune to React re-renders).
  const processQuizHtml = useCallback((html: string): string => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // 1) Remove all <script> tags
      doc.querySelectorAll('script').forEach(s => s.remove());

      // 2) Remove clear-choice divs entirely (radio with checked + value=-1)
      doc.querySelectorAll('.qtype_multichoice_clearchoice').forEach(div => div.remove());

      // 3) Convert answer-label divs → proper <label for="radioId"> elements
      doc.querySelectorAll('[data-region="answer-label"]').forEach(div => {
        const row = div.parentElement;
        if (!row) return;
        const radio = row.querySelector('input[type="radio"], input[type="checkbox"]') as HTMLInputElement | null;
        if (!radio?.id) return;

        const label = doc.createElement('label');
        label.htmlFor = radio.id;
        // Copy every attribute from the div
        Array.from(div.attributes).forEach(attr =>
          label.setAttribute(attr.name, attr.value)
        );
        label.innerHTML = div.innerHTML;
        row.replaceChild(label, div);
      });

      return doc.body.innerHTML;
    } catch {
      return html; // fallback: render original
    }
  }, []);

  // ── Question type label helper ─────────────────────────────────────────
  const questionTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      multichoice: 'Multiple Choice',
      truefalse: 'True / False',
      shortanswer: 'Short Answer',
      essay: 'Essay',
      numerical: 'Numerical',
      match: 'Matching',
      description: 'Description',
      calculated: 'Calculated',
      multianswer: 'Cloze / Fill in the blanks',
    };
    return map[type] || type;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* ── Header Bar ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-4 shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowExitConfirm(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-[#111418] rounded-lg transition-colors"
              title="Exit quiz"
            >
              <ArrowLeft size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">{quiz.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Page {currentPage + 1} {nextPage >= 0 ? '' : '(last)'}
                {quiz.grade > 0 && <span className="ml-2">· Max grade: {quiz.grade}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {timeLeft !== null && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-sm font-bold ${
                timeLeft < 60
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 animate-pulse'
                  : timeLeft < 300
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-[#1E5BF0]/10 text-[#1E5BF0] dark:bg-[#1E5BF0]/20 dark:text-[#4A9FFF]'
              }`}>
                <Clock size={14} />
                {formatTime(timeLeft)}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-[#111418] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#1E2025] transition-colors text-sm font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Progress indicator */}
        {quiz.timelimit > 0 && timeLeft !== null && (
          <div className="mt-3 h-1.5 bg-gray-100 dark:bg-[#111418] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                timeLeft < 60 ? 'bg-red-500' : timeLeft < 300 ? 'bg-amber-500' : 'bg-[#1E5BF0]'
              }`}
              style={{ width: `${Math.max(0, (timeLeft / quiz.timelimit) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* ── Questions ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-[#1E5BF0]" size={40} />
        </div>
      ) : (
        <div ref={formRef} className="space-y-4">
          {questions.map((q, idx) => (
            <motion.div
              key={q.slot || idx}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white dark:bg-[#1A1C20] rounded-2xl shadow-sm dark:shadow-none border border-transparent dark:border-[#2A2D32] overflow-hidden"
            >
              {/* Question header */}
              <div className="px-6 py-4 bg-gradient-to-r from-[#1E5BF0]/5 to-transparent dark:from-[#1E5BF0]/10 dark:to-transparent border-b border-gray-100 dark:border-[#2A2D32] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#1E5BF0] text-white flex items-center justify-center text-sm font-bold shadow-sm">
                    {q.number || q.slot}
                  </span>
                  <div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      Question {q.number || q.slot}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                      {questionTypeLabel(q.type)}
                    </span>
                  </div>
                </div>
                {q.maxmark !== undefined && (
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-[#111418] px-2.5 py-1 rounded-lg">
                    {q.maxmark} {q.maxmark === 1 ? 'mark' : 'marks'}
                  </span>
                )}
              </div>

              {/* Question body */}
              <div className="p-6">
                <MoodleQuestionHtml html={q.html} processHtml={processQuizHtml} />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      {!loading && (
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1E2025] transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-medium text-sm"
          >
            <ArrowLeft size={16} /> Previous
          </button>

          <div className="flex items-center gap-3">
            {nextPage >= 0 ? (
              <button
                onClick={handleNextPage}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1E5BF0] text-white hover:bg-[#184AD0] transition-colors font-semibold text-sm"
              >
                Next <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={() => setShowSubmitConfirm(true)}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 transition-all font-bold text-sm shadow-sm disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {submitting ? 'Submitting...' : 'Submit Quiz'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Submit Confirmation Dialog ──────────────────────────────────── */}
      {showSubmitConfirm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowSubmitConfirm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white dark:bg-[#1A1C20] rounded-2xl p-6 shadow-2xl max-w-sm w-full border border-gray-200 dark:border-[#2A2D32]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <ShieldCheck size={20} className="text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Submit Quiz?</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Once submitted, you <strong>cannot change your answers</strong>. Make sure you've reviewed all questions before submitting.
              </p>
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => setShowSubmitConfirm(false)}
                  className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-[#111418] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#1E2025] transition-colors font-medium"
                >
                  Review Answers
                </button>
                <button
                  onClick={() => { setShowSubmitConfirm(false); handleSubmit(); }}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 transition-all font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Yes, Submit'}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}

      {/* ── Exit Confirmation Dialog ────────────────────────────────────── */}
      {showExitConfirm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowExitConfirm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white dark:bg-[#1A1C20] rounded-2xl p-6 shadow-2xl max-w-sm w-full border border-gray-200 dark:border-[#2A2D32]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <LogOut size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Leave Quiz?</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Your attempt will remain <strong>in progress</strong>. You can resume it later from the quiz list.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                Your current answers will be saved before leaving.
              </p>
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="px-4 py-2 rounded-xl bg-[#1E5BF0] text-white hover:bg-[#184AD0] transition-colors font-semibold"
                >
                  Continue Quiz
                </button>
                <button
                  onClick={handleExitConfirmed}
                  className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-[#111418] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#1E2025] transition-colors font-medium"
                >
                  Save &amp; Leave
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}

      {/* ── Quiz question styling ───────────────────────────────────────── */}
      <style>{`
        /* ── Base reset ─────────────────────────────────────────────────── */
        .quiz-question-html {
          font-size: 0.95rem;
          line-height: 1.7;
          color: #374151;
        }
        .dark .quiz-question-html {
          color: #d1d5db;
        }

        /* ── Question text ──────────────────────────────────────────────── */
        .quiz-question-html .qtext {
          font-size: 1.05rem;
          font-weight: 600;
          line-height: 1.6;
          margin-bottom: 16px;
          color: #111827;
        }
        .dark .quiz-question-html .qtext {
          color: #f3f4f6;
        }
        .quiz-question-html .formulation {
          margin-bottom: 8px;
        }

        /* ── Answer choices ─────────────────────────────────────────────── */
        .quiz-question-html .answer {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        /* Only style real answer rows (.r0/.r1), NOT .qtype_multichoice_clearchoice */
        .quiz-question-html .answer > .r0,
        .quiz-question-html .answer > .r1,
        .quiz-question-html .answer > label {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 12px;
          border: 2px solid #e5e7eb;
          background: #f9fafb;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
          -webkit-user-select: none;
        }
        .dark .quiz-question-html .answer > .r0,
        .dark .quiz-question-html .answer > .r1,
        .dark .quiz-question-html .answer > label {
          border-color: #2A2D32;
          background: #111418;
        }
        .quiz-question-html .answer > .r0:hover,
        .quiz-question-html .answer > .r1:hover,
        .quiz-question-html .answer > label:hover {
          border-color: #93c5fd;
          background: #eff6ff;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(30, 91, 240, 0.08);
        }
        .dark .quiz-question-html .answer > .r0:hover,
        .dark .quiz-question-html .answer > .r1:hover,
        .dark .quiz-question-html .answer > label:hover {
          border-color: #1E5BF0;
          background: rgba(30, 91, 240, 0.08);
          box-shadow: 0 2px 8px rgba(30, 91, 240, 0.12);
        }
        .quiz-question-html .answer > .r0:active,
        .quiz-question-html .answer > .r1:active,
        .quiz-question-html .answer > label:active {
          transform: translateY(0);
        }


        /* Selected state via :has */
        .quiz-question-html .answer > .r0:has(input:checked),
        .quiz-question-html .answer > .r1:has(input:checked),
        .quiz-question-html .answer > label:has(input:checked) {
          border-color: #1E5BF0;
          background: rgba(30, 91, 240, 0.08);
          box-shadow: 0 0 0 1px rgba(30, 91, 240, 0.2);
        }
        .dark .quiz-question-html .answer > .r0:has(input:checked),
        .dark .quiz-question-html .answer > .r1:has(input:checked),
        .dark .quiz-question-html .answer > label:has(input:checked) {
          border-color: #3B82F6;
          background: rgba(30, 91, 240, 0.15);
          box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.3);
        }

        /* ── Radio & checkbox (only answer radios, not clear-choice) ─────── */
        .quiz-question-html .answer > .r0 > input[type="radio"],
        .quiz-question-html .answer > .r0 > input[type="checkbox"],
        .quiz-question-html .answer > .r1 > input[type="radio"],
        .quiz-question-html .answer > .r1 > input[type="checkbox"] {
          accent-color: #1E5BF0;
          width: 20px;
          height: 20px;
          cursor: pointer;
          flex-shrink: 0;
        }

        /* ── Labels (answer text after HTML preprocessing) ──────────── */
        .quiz-question-html .answer label[for] {
          cursor: pointer;
          flex: 1;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.95rem;
          color: #374151;
        }
        .dark .quiz-question-html .answer label[for] {
          color: #d1d5db;
        }

        /* ── Moodle Bootstrap utility classes (not loaded in React) ───── */
        .quiz-question-html .d-flex { display: flex; }
        .quiz-question-html .w-auto { width: auto; }
        .quiz-question-html .flex-fill { flex: 1 1 auto; min-width: 0; }
        .quiz-question-html .ml-1 { margin-left: 0.25rem; }
        .quiz-question-html .sr-only {
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

        /* ── Answer number letter (a. b. c. d.) ─────────────────────────── */
        .quiz-question-html .answernumber {
          font-weight: 600;
          color: #6b7280;
          min-width: 24px;
          flex-shrink: 0;
        }
        .dark .quiz-question-html .answernumber {
          color: #9ca3af;
        }

        /* ── Hide Moodle info bar (we render our own question header) ──── */
        .quiz-question-html .info {
          display: none;
        }

        /* ── Select / dropdown ──────────────────────────────────────────── */
        .quiz-question-html select {
          appearance: none;
          background: #f9fafb url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e") right 10px center / 16px no-repeat;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          padding: 10px 36px 10px 14px;
          font-size: 0.95rem;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .quiz-question-html select:focus {
          outline: none;
          border-color: #1E5BF0;
          box-shadow: 0 0 0 3px rgba(30, 91, 240, 0.1);
        }
        .dark .quiz-question-html select {
          background-color: #111418;
          border-color: #2A2D32;
          color: #e5e7eb;
        }
        .dark .quiz-question-html select:focus {
          border-color: #3B82F6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }

        /* ── Textarea ───────────────────────────────────────────────────── */
        .quiz-question-html textarea {
          width: 100%;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          padding: 12px 16px;
          min-height: 100px;
          font-size: 0.95rem;
          line-height: 1.6;
          resize: vertical;
          transition: border-color 0.15s;
        }
        .quiz-question-html textarea:focus {
          outline: none;
          border-color: #1E5BF0;
          box-shadow: 0 0 0 3px rgba(30, 91, 240, 0.1);
        }
        .dark .quiz-question-html textarea {
          background-color: #111418;
          border-color: #2A2D32;
          color: #e5e7eb;
        }
        .dark .quiz-question-html textarea:focus {
          border-color: #3B82F6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }

        /* ── Text input (short answer, numerical) ───────────────────────── */
        .quiz-question-html input[type="text"],
        .quiz-question-html input[type="number"] {
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 0.95rem;
          width: 100%;
          max-width: 400px;
          transition: border-color 0.15s;
        }
        .quiz-question-html input[type="text"]:focus,
        .quiz-question-html input[type="number"]:focus {
          outline: none;
          border-color: #1E5BF0;
          box-shadow: 0 0 0 3px rgba(30, 91, 240, 0.1);
        }
        .dark .quiz-question-html input[type="text"],
        .dark .quiz-question-html input[type="number"] {
          background-color: #111418;
          border-color: #2A2D32;
          color: #e5e7eb;
        }
        .dark .quiz-question-html input[type="text"]:focus,
        .dark .quiz-question-html input[type="number"]:focus {
          border-color: #3B82F6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }

        /* ── "Clear my choice" (removed by processQuizHtml, safety hide) ── */
        .quiz-question-html .qtype_multichoice_clearchoice {
          display: none !important;
        }

        /* ── Flag checkbox ──────────────────────────────────────────────── */
        .quiz-question-html .questionflag {
          display: none;
        }

        /* ── Prompt / instructions under question ───────────────────────── */
        .quiz-question-html .prompt {
          font-size: 0.8rem;
          color: #9ca3af;
          margin-top: 4px;
        }

        /* ── Hide Moodle cruft ──────────────────────────────────────────── */
        .quiz-question-html .im-controls,
        .quiz-question-html .questioncorrectnessicon,
        .quiz-question-html input[type="hidden"] {
          display: none !important;
        }
      `}</style>
    </motion.div>
  );
}
