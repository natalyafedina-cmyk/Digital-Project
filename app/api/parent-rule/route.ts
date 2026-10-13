import { authenticatedRequestClient } from "@/lib/supabase/request-client";
import { createLLMProvider } from "@/lib/providers";
import { interpretParentRule } from "@/lib/parent-rule-engine";
export async function POST(request: Request) {
  try {
    const client = await authenticatedRequestClient(request);
    if (!client) return Response.json({ error: "Нужен вход родителя." }, { status: 401 });
    const body = await request.json();
    if (typeof body.text !== "string" || !body.text.trim()) return Response.json({ error: "Введите правило." }, { status: 400 });
    const interpretation = await interpretParentRule(createLLMProvider(), body.text, new Date().toISOString(), async (id, subject, course) => {
      let query = client.from("skills").select("id").eq("id", id).eq("active",true);
      if (subject) query = query.eq("subject_id",subject);
      if (course) query = query.or(`course_id.eq.${course},course_id.is.null`);
      const result = await query.maybeSingle(); return !result.error && Boolean(result.data);
    });
    return Response.json(interpretation, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Не удалось интерпретировать правило. Уточните формулировку и попробуйте снова." }, { status: 503 }); }
}
