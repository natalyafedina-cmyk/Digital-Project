import type { Course, SubjectId } from "./types";
export const COURSES: readonly Course[] = [
  { id: "math.algebra", subjectId: "math", displayName: "Алгебра" },
  { id: "math.geometry", subjectId: "math", displayName: "Геометрия" },
  { id: "math.probability_statistics", subjectId: "math", displayName: "Вероятность и статистика" },
  { id: "russian.language", subjectId: "russian", displayName: "Русский язык" },
  { id: "english.language", subjectId: "english", displayName: "Английский язык" },
  { id: "literature.general", subjectId: "literature", displayName: "Литература" },
  { id: "physics.general", subjectId: "physics", displayName: "Физика" },
  { id: "biology.general", subjectId: "biology", displayName: "Биология" },
  { id: "geography.general", subjectId: "geography", displayName: "География" },
  { id: "history.russia", subjectId: "history", displayName: "История России" },
  { id: "history.world", subjectId: "history", displayName: "Всеобщая история" },
  { id: "history.moscow_region", subjectId: "history", displayName: "История Московской области", classification: "regional" },
  { id: "informatics.general", subjectId: "informatics", displayName: "Информатика" },
];
export function coursesForSubject(subjectId: string) {
  return COURSES.filter(course => course.subjectId === subjectId);
}
export function resolveCourse(subjectId: SubjectId, courseId?: string | null): Course | null {
  const courses = coursesForSubject(subjectId);
  if (courseId) {
    const selected = courses.find(course => course.id === courseId);
    if (!selected) throw new Error("Курс не относится к выбранному предмету.");
    return selected;
  }
  return courses.length === 1 ? courses[0] : null;
}
export function courseQuery(courseId?: string | null) {
  return courseId ? `?course=${encodeURIComponent(courseId)}` : "";
}
