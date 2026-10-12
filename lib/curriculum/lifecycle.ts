import type { SupabaseClient } from "@supabase/supabase-js";
// Atomic RPCs operate under the current parent's RLS; they never receive mastery values.
export async function transitionAcademicEnrollment(client: SupabaseClient, input: {
  fromEnrollmentId: string; academicYearId: string; grade: number; curriculumProgramId: string; startedOn: string;
}): Promise<string> {
  const { data, error } = await client.rpc("transition_student_enrollment", {
    p_from_enrollment_id: input.fromEnrollmentId, p_academic_year_id: input.academicYearId,
    p_grade: input.grade, p_curriculum_program_id: input.curriculumProgramId, p_started_on: input.startedOn,
  });
  if (error || typeof data !== "string") throw new Error("Не удалось выполнить учебный переход.");
  return data;
}
export async function replaceTextbookAssignment(client: SupabaseClient, input: {
  assignmentId: string; textbookEditionId: string; validFrom: string;
}): Promise<string> {
  const { data, error } = await client.rpc("replace_student_textbook", {
    p_assignment_id: input.assignmentId, p_textbook_edition_id: input.textbookEditionId, p_valid_from: input.validFrom,
  });
  if (error || typeof data !== "string") throw new Error("Не удалось сменить учебник.");
  return data;
}
