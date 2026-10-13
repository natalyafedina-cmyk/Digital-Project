import type { SupabaseClient } from "@supabase/supabase-js";
import { initialState, readState } from "./lesson-state";
import type { LessonState } from "./types";
import type { Target } from "@/lib/learning-request/types";
export async function loadLesson(
  client: SupabaseClient,
  sessionId: string,
  childId: string,
  target: Target,
): Promise<LessonState> {
  const { data, error } = await client
    .from("study_sessions")
    .select(
      "id,subject,course_id,target_curriculum_unit_id,target_skill_id,lesson_state",
    )
    .eq("id", sessionId)
    .eq("child_id", childId)
    .maybeSingle();
  if (error || !data || data.subject !== target.subjectId)
    throw new Error("Session unavailable");
  const validTarget = {
    ...target,
    courseId: data.course_id || target.courseId,
    curriculumUnitId: data.target_curriculum_unit_id || null,
    skillId: data.target_skill_id || null,
  };
  const state = readState(data.lesson_state, validTarget);
  return { ...state, target: validTarget };
}
export async function persistLesson(
  client: SupabaseClient,
  sessionId: string,
  childId: string,
  state: LessonState,
) {
  const saved = await client
    .from("study_sessions")
    .update({
      course_id: state.target.courseId,
      target_curriculum_unit_id: state.target.curriculumUnitId,
      target_skill_id: state.target.skillId,
      lesson_phase: state.phase,
      lesson_state: state,
    })
    .eq("id", sessionId)
    .eq("child_id", childId)
    .select("id")
    .single();
  if (saved.error || !saved.data) throw new Error("Session state unavailable");
  if (state.target.skillId) {
    const role = state.resumeTarget ? "prerequisite" : "target";
    const link = await client
      .from("session_skills")
      .insert({ session_id: sessionId, skill_id: state.target.skillId, role });
    if (link.error && link.error.code !== "23505")
      throw new Error("Target link unavailable");
  }
}
export { initialState };
