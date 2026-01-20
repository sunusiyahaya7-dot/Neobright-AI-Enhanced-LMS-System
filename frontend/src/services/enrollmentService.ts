import api from "../api/client";

export async function enrollInCourse(courseId: number) {
  const res = await api.post("/enrollments", { courseId });
  return res.data;
}

export async function getMyEnrollments() {
  const res = await api.get("/enrollments");
  return res.data;
}

export async function updateProgress(enrollmentId: string, progress: number, completedSection?: string) {
  const res = await api.put(`/enrollments/${enrollmentId}/progress`, {
    progress,
    completedSection
  });
  return res.data;
}

export async function getCourseEnrollment(courseId: number) {
  const res = await api.get(`/courses/${courseId}/enrollment`);
  return res.data;
}