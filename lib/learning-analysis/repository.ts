import type { SupabaseClient } from "@supabase/supabase-js";
import type { Skill } from "@/lib/curriculum/types";
// Bounded candidates from actual catalog, with curriculum relevance ordering and no invented IDs.
export async function candidateSkills(client: SupabaseClient, subjectId: string, courseId: string | null, programId?: string, grade?: number): Promise<Skill[]> {
  if (!courseId) return [];
  try {
  const query = client.from("skills").select("id,subject_id,course_id,title").eq("subject_id", subjectId).eq("active",true)
    .or(`course_id.eq.${courseId},course_id.is.null`).order("id").limit(12);
  const { data, error } = await query;
  if (error) return [];
  const skills = (data || []) as Skill[];
  if (programId && grade) {
    const units = await client.from("curriculum_units").select("id").eq("program_id",programId).eq("course_id",courseId).eq("grade",grade).order("order_index").limit(12);
    if (units.data?.length) {
      const links = await client.from("curriculum_unit_skills").select("skill_id").in("curriculum_unit_id",units.data.map(u=>u.id)).limit(24);
      const relevant = new Set(links.data?.map(l=>l.skill_id));
      skills.sort((a,b)=>Number(relevant.has(b.id))-Number(relevant.has(a.id)) || a.id.localeCompare(b.id));
    }
  }
  return skills;
  } catch { return []; }
}
