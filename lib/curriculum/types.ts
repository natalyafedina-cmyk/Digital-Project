export type SubjectId = "math" | "russian" | "english" | "literature" | "physics" | "biology" | "geography" | "history" | "informatics";
export type Course = { id: string; subjectId: SubjectId; displayName: string; classification?: "regional" };
export type Child = { id: string; name: string; grade: number };
export type AcademicYear = { id: string; label: string; starts_on: string; ends_on: string };
export type CurriculumProgram = { id: string; name: string };
export type Enrollment = {
  id: string; child_id: string; academic_year_id: string; grade: number;
  curriculum_program_id: string; program_confirmed: boolean;
  status: "planned" | "active" | "completed" | "cancelled";
  started_on: string; ended_on: string | null;
};
export type TextbookAssignment = {
  id: string; enrollment_id: string; course_id: string; textbook_edition_id: string;
  role: "primary" | "additional" | "workbook" | "task_collection" | "reference";
  valid_from: string; valid_to: string | null; status: Enrollment["status"];
};
export type Textbook = { id: string; course_id: string; title: string; publication_year: number | null };
export type Skill = { id: string; subject_id: string; course_id: string | null; title: string };
export type SkillState = {
  child_id: string; skill_id: string;
  status: "not_seen" | "introduced" | "learning" | "nearly_mastered" | "mastered" | "needs_review";
  mastery_score: number | null; confidence: number; evidence_count: number;
};
export type LearningContext = {
  child: Child; grade: number; gradeSource: "enrollment" | "legacy";
  enrollment: Pick<Enrollment, "id" | "program_confirmed"> | null;
  academicYear: AcademicYear | null; program: CurriculumProgram | null;
  subject: { id: SubjectId; displayName: string }; course: Course | null;
  textbooks: { assignment: TextbookAssignment; edition: Textbook }[];
  relevantSkill: { skill: Skill; state: SkillState | null } | null;
};
