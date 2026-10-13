import type { SupabaseClient } from "@supabase/supabase-js";
import { coursesForSubject } from "@/lib/curriculum/catalog";
import { candidateSkills } from "@/lib/learning-analysis/repository";
import type { RequestCatalog, Unit } from "./types";
export async function requestCatalog(
  client: SupabaseClient,
  subjectId: string,
  courseId: string | null,
  programId?: string,
  grade?: number,
): Promise<RequestCatalog> {
  const courses = coursesForSubject(subjectId);
  if (!courseId) {
    // Balanced shortlist keeps the whole semantic request within one model call.
    const lists = await Promise.all(
      courses.map((c) =>
        requestCatalog(client, subjectId, c.id, programId, grade),
      ),
    );
    const per = Math.max(1, Math.floor(12 / courses.length));
    return {
      courses,
      units: lists.flatMap((l) => l.units.slice(0, per)).slice(0, 12),
      skills: lists.flatMap((l) => l.skills.slice(0, per)).slice(0, 12),
    };
  }
  const units =
    programId && grade
      ? await client
          .from("curriculum_units")
          .select("id,title,course_id")
          .eq("program_id", programId)
          .eq("course_id", courseId)
          .eq("grade", grade)
          .order("order_index")
          .limit(12)
      : null;
  if (units?.error) throw new Error("Curriculum unavailable");
  return {
    courses,
    units: (units?.data || []) as Unit[],
    skills: await candidateSkills(
      client,
      subjectId,
      courseId,
      programId,
      grade,
    ),
  };
}
