import type { SupabaseClient } from "@supabase/supabase-js";
import type { AcademicYear, Child, CurriculumProgram, Enrollment, Skill, SkillState, Textbook, TextbookAssignment } from "./types";
export interface LearningContextRepository {
  child(id: string): Promise<Child | null>;
  activeEnrollment(childId: string, asOf: string): Promise<Enrollment | null>;
  year(id: string): Promise<AcademicYear | null>;
  program(id: string): Promise<CurriculumProgram | null>;
  assignments(enrollmentId: string, courseId: string, asOf: string): Promise<TextbookAssignment[]>;
  textbooks(ids: string[]): Promise<Textbook[]>;
  skill(id: string, subjectId: string): Promise<Skill | null>;
  skillState(childId: string, skillId: string): Promise<SkillState | null>;
}
// Use an authenticated parent's public-key client. RLS is the ownership boundary.
// A missing migration is a controlled legacy fallback, not a reason to bypass RLS.
function value<T>(result: { data: unknown; error: { code?: string } | null }): T | null {
  if (result.error) {
    if (["42P01", "PGRST205"].includes(result.error.code || "")) return null;
    throw new Error("Учебный контекст временно недоступен.");
  }
  return result.data as T | null;
}
export class SupabaseCurriculumRepository implements LearningContextRepository {
  constructor(private client: SupabaseClient) {}
  async child(id: string) {
    return value<Child>(await this.client.from("children").select("id,name,grade").eq("id", id).maybeSingle());
  }
  async activeEnrollment(childId: string, asOf: string) {
    return value<Enrollment>(await this.client.from("student_enrollments")
      .select("id,child_id,academic_year_id,grade,curriculum_program_id,program_confirmed,status,started_on,ended_on")
      .eq("child_id", childId).eq("status", "active").lte("started_on", asOf)
      .or(`ended_on.is.null,ended_on.gte.${asOf}`).order("started_on", { ascending: false }).limit(1).maybeSingle());
  }
  async year(id: string) {
    return value<AcademicYear>(await this.client.from("academic_years").select("id,label,starts_on,ends_on").eq("id", id).maybeSingle());
  }
  async program(id: string) {
    return value<CurriculumProgram>(await this.client.from("curriculum_programs").select("id,name").eq("id", id).maybeSingle());
  }
  async assignments(enrollmentId: string, courseId: string, asOf: string) {
    return value<TextbookAssignment[]>(await this.client.from("student_textbook_assignments")
      .select("id,enrollment_id,course_id,textbook_edition_id,role,valid_from,valid_to,status")
      .eq("enrollment_id", enrollmentId).eq("course_id", courseId).in("status", ["active", "completed"])
      .lte("valid_from", asOf).or(`valid_to.is.null,valid_to.gte.${asOf}`).order("valid_from").limit(12)) || [];
  }
  async textbooks(ids: string[]) {
    if (!ids.length) return [];
    return value<Textbook[]>(await this.client.from("textbook_editions")
      .select("id,course_id,title,publication_year").in("id", ids).limit(12)) || [];
  }
  async skill(id: string, subjectId: string) {
    return value<Skill>(await this.client.from("skills").select("id,subject_id,course_id,title")
      .eq("id", id).eq("subject_id", subjectId).eq("active", true).maybeSingle());
  }
  async skillState(childId: string, skillId: string) {
    return value<SkillState>(await this.client.from("student_skill_state")
      .select("child_id,skill_id,status,mastery_score,confidence,evidence_count")
      .eq("child_id", childId).eq("skill_id", skillId).maybeSingle());
  }
}
