import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { COURSES, coursesForSubject, resolveCourse } from "@/lib/curriculum/catalog";
import data from "@/lib/curriculum/catalog-data.json";
import { getActiveLearningContext, renderAcademicContext } from "@/lib/curriculum/learning-context";
import { SupabaseCurriculumRepository, type LearningContextRepository } from "@/lib/curriculum/repository";
import { buildTutorInstructions, SUBJECTS } from "@/lib/tutor-config";
import { getSubjectAdaptivePrompt, SUBJECT_STRATEGIES } from "@/lib/adaptive-learning";
import type { SupabaseClient } from "@supabase/supabase-js";

function repository(overrides: Partial<LearningContextRepository> = {}): LearningContextRepository {
  return {
    child: vi.fn().mockResolvedValue({ id: "child", name: "Test learner", grade: 6 }),
    activeEnrollment: vi.fn().mockResolvedValue({ id: "enrollment", child_id: "child", academic_year_id: "2026-27", grade: 7, curriculum_program_id: "ru.fgos_ooo.base", program_confirmed: false }),
    year: vi.fn().mockResolvedValue(data.academic_years[0]),
    program: vi.fn().mockResolvedValue(data.curriculum_programs[0]),
    assignments: vi.fn().mockResolvedValue([]), textbooks: vi.fn().mockResolvedValue([]),
    skill: vi.fn().mockResolvedValue(null), skillState: vi.fn().mockResolvedValue(null), ...overrides,
  };
}
it("has exactly nine UI subjects, thirteen courses and coherent single-course selection", () => {
  expect(Object.keys(SUBJECTS).sort()).toEqual(data.subjects.map(s => s.id).sort());
  expect(Object.keys(SUBJECTS)).toHaveLength(9);
  expect(SUBJECTS.informatics.name).toBe("Информатика");
  expect(COURSES.map(c => c.id)).toEqual(data.courses.map(c => c.id));
  expect(COURSES).toHaveLength(13);
  expect(coursesForSubject("math")).toHaveLength(3);
  expect(coursesForSubject("history")).toHaveLength(3);
  expect(resolveCourse("history")).toBeNull();
  expect(resolveCourse("math")).toBeNull();
  for (const id of ["russian", "english", "literature", "physics", "biology", "geography", "informatics"] as const) {
    expect(resolveCourse(id)?.subjectId).toBe(id);
  }
  expect(resolveCourse("history", "history.moscow_region")?.classification).toBe("regional");
  expect(() => resolveCourse("math", "history.world")).toThrow();
  const home = readFileSync("app/page.tsx", "utf8");
  expect([...home.matchAll(/href: "\/subject\/(\w+)"/g)].map(m => m[1]).sort()).toEqual(Object.keys(SUBJECTS).sort());
});
it("uses enrollment grade over the legacy grade and passes it into tutor instructions", async () => {
  const context = await getActiveLearningContext("child", "math", "math.geometry", repository());
  expect(context.grade).toBe(7); expect(context.gradeSource).toBe("enrollment");
  const prompt = buildTutorInstructions("math", "topic", { displayName: context.child.name, grade: context.grade, tutorName: "Test tutor" });
  expect(prompt).toContain("Test learner"); expect(prompt).toContain("7 класса"); expect(prompt).not.toContain("Софья");
});
it("uses children.grade without an enrollment, and refuses inaccessible children", async () => {
  const repo = repository({ activeEnrollment: vi.fn().mockResolvedValue(null) });
  const context = await getActiveLearningContext("child", "english", undefined, repo);
  expect(context.grade).toBe(6); expect(context.gradeSource).toBe("legacy");
  expect(context.course?.id).toBe("english.language");
  expect(repo.year).not.toHaveBeenCalled(); expect(repo.assignments).not.toHaveBeenCalled();
  await expect(getActiveLearningContext("other-child", "math", undefined, repository({ child: vi.fn().mockResolvedValue(null) }))).rejects.toThrow("недоступен");
});
it("loads only selected assignments and an explicitly known relevant skill", async () => {
  const book = data.textbook_editions.find(b => b.course_id === "math.algebra")!;
  const assignment = { id: "assignment", enrollment_id: "enrollment", course_id: book.course_id, textbook_edition_id: book.id, role: "primary", valid_from: "2026-09-01", valid_to: null, status: "active" };
  const repo = repository({ assignments: vi.fn().mockResolvedValue([assignment]), textbooks: vi.fn().mockResolvedValue([book]) });
  const context = await getActiveLearningContext("child", "math", "math.algebra", repo, { asOf: "2026-10-12", skillId: "unknown" });
  expect(repo.assignments).toHaveBeenCalledWith("enrollment", "math.algebra", "2026-10-12");
  expect(repo.textbooks).toHaveBeenCalledWith([book.id]);
  expect(context.relevantSkill).toBeNull(); expect(repo.skillState).not.toHaveBeenCalled();
  const prompt = renderAcademicContext(context);
  expect(prompt).toContain(book.title); expect(prompt).not.toContain("Московская область");
  expect(prompt).not.toContain("topic_progress"); expect(prompt).not.toContain("messages");
});
it("allows multiple simultaneous reusable books, independently of permanent skill state", async () => {
  const book = data.textbook_editions[0];
  const assignments = ["primary", "additional"].map((role, i) => ({ id: `a${i}`, enrollment_id: "e", course_id: book.course_id, textbook_edition_id: book.id, role, valid_from: "2026-09-01", valid_to: null, status: "active" }));
  const skill = data.skills[0], state = { child_id: "child", skill_id: skill.id, status: "learning", mastery_score: 42, confidence: .5, evidence_count: 3 };
  const repo = repository({ assignments: vi.fn().mockResolvedValue(assignments), textbooks: vi.fn().mockResolvedValue([book]), skill: vi.fn().mockResolvedValue(skill), skillState: vi.fn().mockResolvedValue(state) });
  const context = await getActiveLearningContext("child", "math", "math.algebra", repo, { skillId: skill.id });
  expect(context.textbooks).toHaveLength(2); expect(context.relevantSkill?.state).toEqual(state);
  expect(context.textbooks[0].edition).not.toHaveProperty("child_id");
  expect(state).not.toHaveProperty("textbook_edition_id");
});
it("keeps informatics in data-driven adaptive strategies without changing existing English rules", () => {
  expect(SUBJECT_STRATEGIES.informatics.preferred).toContain("step_by_step");
  expect(getSubjectAdaptivePrompt("informatics")).toContain("Информатика");
  expect(getSubjectAdaptivePrompt("english")).toContain("русский как язык объяснения");
  expect(getSubjectAdaptivePrompt("unknown")).toBe("");
});

describe("bounded repository reads", () => {
  it("filters by identity/course/date, limits reads, and never loads history or an entire catalog", async () => {
    const calls: { table: string; method: string; args: unknown[] }[] = [];
    const client = { from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "lte", "or", "order", "limit", "maybeSingle"]) {
        chain[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return chain; };
      }
      chain.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
      return chain;
    } } as unknown as SupabaseClient;
    const repo = new SupabaseCurriculumRepository(client);
    await repo.activeEnrollment("child", "2026-10-12");
    await repo.assignments("e", "math.geometry", "2026-10-12");
    await repo.textbooks(["book"]); await repo.skill("known", "math"); await repo.skillState("child", "known");
    expect(calls.some(c => c.method === "select" && c.args[0] === "*")).toBe(false);
    expect(calls.some(c => ["messages", "topic_progress", "study_sessions"].includes(c.table))).toBe(false);
    expect(calls).toContainEqual({ table: "student_textbook_assignments", method: "eq", args: ["course_id", "math.geometry"] });
    expect(calls).toContainEqual({ table: "student_textbook_assignments", method: "limit", args: [12] });
    expect(calls).toContainEqual({ table: "student_skill_state", method: "eq", args: ["child_id", "child"] });
    expect(calls).toContainEqual({ table: "textbook_editions", method: "in", args: ["id", ["book"]] });
  });
});
it("contains an additive migration without learner seeds, legacy conversion or support-stage widening", () => {
  const file = readdirSync("supabase/migrations").find(f => f.endsWith("_student_curriculum_lifecycle_v1.sql"))!;
  const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
  expect(sql).not.toMatch(/drop\s+(table|column)|truncate|delete\s+from|security\s+definer|auth\.role\(|user_metadata/i);
  const topLevel = sql.replace(/\$\$[\s\S]*?\$\$/g, "");
  expect(topLevel).not.toMatch(/insert into public\.(children|student_enrollments|student_textbook_assignments|student_skill_state)\b/i);
  expect(sql).not.toMatch(/alter table public\.topic_progress|from public\.topic_progress|Софья/i);
  expect(sql).toContain("support_stage between 0 and 4");
  expect(sql).toContain("where status = 'active'");
  expect(sql).toContain("security invoker");
  expect(sql).toContain("using (exists"); expect(sql).toContain("with check (exists");
  expect(sql).not.toMatch(/update public\.student_skill_state/i);
});
