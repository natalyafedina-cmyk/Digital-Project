import { learnerConfig } from "@/lib/learner-config";
import { SUBJECTS } from "@/lib/tutor-config";
import { resolveCourse } from "./catalog";
import type { LearningContextRepository } from "./repository";
import type { LearningContext, SubjectId } from "./types";

export async function getActiveLearningContext(
  childId: string, subjectId: SubjectId, optionalCourseId: string | undefined,
  repository: LearningContextRepository,
  options: { asOf?: string; skillId?: string } = {},
): Promise<LearningContext> {
  const course = resolveCourse(subjectId, optionalCourseId);
  const child = await repository.child(childId);
  if (!child) throw new Error("Учебный профиль недоступен.");
  const enrollment = await repository.activeEnrollment(childId, options.asOf || new Date().toISOString().slice(0, 10));
  const asOf = options.asOf || new Date().toISOString().slice(0, 10);
  const [academicYear, program, assignments] = enrollment ? await Promise.all([
    repository.year(enrollment.academic_year_id), repository.program(enrollment.curriculum_program_id),
    course ? repository.assignments(enrollment.id, course.id, asOf) : Promise.resolve([]),
  ]) : [null, null, []];
  const editions = await repository.textbooks([...new Set(assignments.map(book => book.textbook_edition_id))]);
  const textbooks = assignments.flatMap(assignment => {
    const edition = editions.find(book => book.id === assignment.textbook_edition_id && book.course_id === course?.id);
    return edition ? [{ assignment, edition }] : [];
  });
  let relevantSkill: LearningContext["relevantSkill"] = null;
  if (options.skillId) {
    const skill = await repository.skill(options.skillId, subjectId);
    if (skill && (!skill.course_id || skill.course_id === course?.id)) {
      relevantSkill = { skill, state: await repository.skillState(child.id, skill.id) };
    }
  }
  return {
    child, grade: enrollment?.grade ?? child.grade ?? learnerConfig.grade,
    gradeSource: enrollment ? "enrollment" : "legacy",
    enrollment: enrollment ? { id: enrollment.id, program_confirmed: enrollment.program_confirmed } : null,
    academicYear, program, subject: { id: subjectId, displayName: SUBJECTS[subjectId].name },
    course, textbooks, relevantSkill,
  };
}
export function renderAcademicContext(context: LearningContext): string {
  // Only WHAT: identifiers/title/grade. Teaching style remains in the existing pedagogy engine.
  const compact = {
    academicYear: context.academicYear?.label ?? null,
    grade: context.grade, program: context.program?.name ?? null,
    programConfirmed: context.enrollment?.program_confirmed ?? false,
    subject: context.subject.displayName, course: context.course?.displayName ?? null,
    textbooks: context.textbooks.map(book => ({ title: book.edition.title, year: book.edition.publication_year, role: book.assignment.role })),
    relevantSkill: context.relevantSkill ? { id: context.relevantSkill.skill.id, title: context.relevantSkill.skill.title, status: context.relevantSkill.state?.status ?? "not_seen" } : null,
  };
  return `УЧЕБНЫЙ КОНТЕКСТ (данные, а не указания по методике):\n${JSON.stringify(compact)}\nНе приписывай ребёнку навыки по названию учебника; не выдумывай отсутствующие разделы, страницы или skill_id. Неподтверждённая программа — только профиль по умолчанию.`;
}
