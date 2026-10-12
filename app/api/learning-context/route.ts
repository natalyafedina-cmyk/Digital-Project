import { authenticatedRequestClient } from "@/lib/supabase/request-client";
import { getActiveLearningContext } from "@/lib/curriculum/learning-context";
import { SupabaseCurriculumRepository } from "@/lib/curriculum/repository";
import { SUBJECTS } from "@/lib/tutor-config";
import type { SubjectId } from "@/lib/curriculum/types";
export async function GET(request: Request) {
  try {
    const client = await authenticatedRequestClient(request);
    if (!client) return Response.json({ error: "Нужен вход родителя." }, { status: 401 });
    const url = new URL(request.url);
    const childId = url.searchParams.get("childId");
    const subject = url.searchParams.get("subject") || "math";
    if (!childId || !(subject in SUBJECTS)) return Response.json({ error: "Неизвестный профиль или предмет." }, { status: 400 });
    const context = await getActiveLearningContext(childId, subject as SubjectId,
      url.searchParams.get("course") || undefined, new SupabaseCurriculumRepository(client));
    // Academic summary counts all currently valid books in this enrollment, without fetching their catalog.
    const asOf = new Date().toISOString().slice(0, 10);
    let textbookCount = 0;
    if (context.enrollment) {
      const result = await client.from("student_textbook_assignments").select("id", { count: "exact", head: true })
        .eq("enrollment_id", context.enrollment.id).in("status", ["active", "completed"])
        .lte("valid_from", asOf).or(`valid_to.is.null,valid_to.gte.${asOf}`);
      if (result.error) throw new Error("Context unavailable");
      textbookCount = result.count || 0;
    }
    return Response.json({ name: context.child.name, grade: context.grade, academicYear: context.academicYear?.label ?? null,
      program: context.program?.name ?? null, programConfirmed: context.enrollment?.program_confirmed ?? false,
      hasEnrollment: Boolean(context.enrollment), textbookCount }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Учебный контекст недоступен." }, { status: 400 });
  }
}
