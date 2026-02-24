import api from "../api/client";

// ── Types ────────────────────────────────────────────────────────────────

export interface Quiz {
  id: number;
  coursemodule: number;
  name: string;
  intro: string;
  timeopen: number;   // 0 = no open date
  timeclose: number;  // 0 = no close date
  timelimit: number;  // seconds, 0 = no limit
  grade: number;      // max grade
  maxattempts: number; // 0 = unlimited
  grademethod: number; // 1=highest, 2=average, 3=first, 4=last
  totalAttempts: number;
  finishedAttempts: number;
  hasInProgress: boolean;
  inProgressAttemptId: number | null;
  bestGrade: number | null;
}

export interface QuizAttempt {
  id: number;
  quiz: number;
  userid: number;
  attempt: number;       // attempt number (1, 2, 3...)
  state: "inprogress" | "finished" | "overdue" | "abandoned";
  timestart: number;
  timefinish: number;
  timemodified: number;
  sumgrades: number | null;
  uniqueid: number;
  currentpage: number;
  layout: string;
  preview: number;
}

export interface QuizQuestion {
  slot: number;
  type: string;
  page: number;
  html: string;
  sequencecheck: number;
  lastactiontime: number;
  hasautosavedstep: boolean;
  flagged: boolean;
  number: number;
  state: string;
  status: string;
  blockedbyprevious: boolean;
  mark?: string;
  maxmark?: number;
}

export interface AttemptData {
  questions: QuizQuestion[];
  attempt: QuizAttempt;
  nextpage: number; // -1 = last page
}

export interface AttemptReview {
  questions: QuizQuestion[];
  attempt: QuizAttempt;
  additionaldata: Array<{ id: string; title: string; content: string }>;
  grade: string | number | null;
}

export interface AnswerField {
  name: string;
  value: string;
}

// ── Service ──────────────────────────────────────────────────────────────

export const quizService = {
  /**
   * List all quizzes for a course with attempt summary.
   */
  async getCourseQuizzes(courseId: number): Promise<Quiz[]> {
    try {
      const res = await api.get(`/courses/${courseId}/quizzes`);
      return res.data.quizzes ?? [];
    } catch (error) {
      console.error(`Failed to fetch quizzes for course ${courseId}:`, error);
      throw error;
    }
  },

  /**
   * Get all attempts for the current user on a quiz.
   */
  async getQuizAttempts(quizId: number): Promise<QuizAttempt[]> {
    try {
      const res = await api.get(`/quizzes/${quizId}/attempts`);
      return res.data.attempts ?? [];
    } catch (error) {
      console.error(`Failed to fetch attempts for quiz ${quizId}:`, error);
      throw error;
    }
  },

  /**
   * Start a new quiz attempt.
   */
  async startAttempt(quizId: number): Promise<QuizAttempt> {
    try {
      const res = await api.post(`/quizzes/${quizId}/attempt/start`);
      return res.data.attempt;
    } catch (error) {
      console.error(`Failed to start attempt for quiz ${quizId}:`, error);
      throw error;
    }
  },

  /**
   * Get question data for an in-progress attempt (one page at a time).
   */
  async getAttemptData(quizId: number, attemptId: number, page = 0): Promise<AttemptData> {
    try {
      const res = await api.get(`/quizzes/${quizId}/attempt/${attemptId}`, {
        params: { page },
      });
      return res.data;
    } catch (error) {
      console.error(`Failed to fetch attempt data for attempt ${attemptId}:`, error);
      throw error;
    }
  },

  /**
   * Save answers without submitting.
   */
  async saveAttempt(quizId: number, attemptId: number, data: AnswerField[]): Promise<void> {
    try {
      await api.post(`/quizzes/${quizId}/attempt/${attemptId}/save`, { data });
    } catch (error) {
      console.error(`Failed to save attempt ${attemptId}:`, error);
      throw error;
    }
  },

  /**
   * Submit (finish) an attempt for grading.
   */
  async submitAttempt(quizId: number, attemptId: number, timeup = false): Promise<{ state: string }> {
    try {
      const res = await api.post(`/quizzes/${quizId}/attempt/${attemptId}/submit`, { timeup });
      return res.data.result;
    } catch (error) {
      console.error(`Failed to submit attempt ${attemptId}:`, error);
      throw error;
    }
  },

  /**
   * Get the graded review of a finished attempt.
   */
  async getAttemptReview(quizId: number, attemptId: number): Promise<AttemptReview> {
    try {
      const res = await api.get(`/quizzes/${quizId}/attempt/${attemptId}/review`);
      return res.data;
    } catch (error) {
      console.error(`Failed to fetch review for attempt ${attemptId}:`, error);
      throw error;
    }
  },
};

export default quizService;
