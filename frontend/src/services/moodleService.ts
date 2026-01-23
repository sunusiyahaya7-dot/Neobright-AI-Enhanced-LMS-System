import api from "../api/client";
import { refreshIdToken } from "./authService";

/**
 * Fetch all enrolled courses from Moodle
 */
export const getCourses = async () => {
  // Correct behavior: return only courses the linked Moodle user is enrolled in
  // Also: handle common first-run cases cleanly (token refresh + auto-link).
  try {
    const res = await api.get("/moodle/my-courses");
    return res.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const apiError = err?.response?.data?.error;

    // If the request raced before token was ready or token needs refresh, refresh once then retry.
    if (status === 401) {
      await refreshIdToken();
      const res = await api.get("/moodle/my-courses");
      return res.data;
    }

    // If user is authenticated but not linked to Moodle, try linking by Firebase email then retry.
    if (
      status === 400 &&
      typeof apiError === "string" &&
      apiError.toLowerCase().includes("not linked")
    ) {
      await api.post("/moodle/link", {});
      const res = await api.get("/moodle/my-courses");
      return res.data;
    }

    throw err;
  }
};

/**
 * Fetch unified course materials: Moodle contents + Firestore processed materials
 */
export const getCourseContents = async (courseId: number) => {
  const res = await api.get(`/courses/${courseId}/materials`);
  return res.data;
};

/**
 * Fetch all assignments for a course
 */
export const getCourseAssignments = async (courseId: number) => {
  const res = await api.get(`/courses/${courseId}/assignments`);
  return res.data;
};

/**
 * Fetch course details
 */
export const getCourseDetails = async (courseId: number) => {
  const res = await api.get(`/enrollment/courses/${courseId}`);
  return res.data;
};

/**
 * Link the currently logged-in NeoBright user to a Moodle user.
 * Backend will look up Moodle user by email/username and persist moodle_user_id in Firestore.
 */
export const linkMoodleAccount = async (params?: { email?: string; username?: string }) => {
  const res = await api.post("/moodle/link", params || {});
  return res.data;
};

/**
 * Submit a file to an assignment
 */
export const submitAssignment = async (courseId: number, assignmentId: number, file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const res = await api.post(`/courses/${courseId}/assignments/${assignmentId}/submit`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return res.data;
};
