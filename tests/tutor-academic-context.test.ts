import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), generate: vi.fn(), child: vi.fn(), activeEnrollment: vi.fn(), year: vi.fn(), program: vi.fn(),
  assignments: vi.fn(), textbooks: vi.fn(), skill: vi.fn(), skillState: vi.fn(),
}));
vi.mock("@/lib/supabase/request-client", () => ({ authenticatedRequestClient: mocks.auth }));
vi.mock("@/lib/providers", () => ({ createLLMProvider: () => ({ generate: mocks.generate }), createVisionProvider: vi.fn() }));
vi.mock("@/lib/curriculum/repository", () => ({ SupabaseCurriculumRepository: class {
  child = mocks.child; activeEnrollment = mocks.activeEnrollment; year = mocks.year; program = mocks.program;
  assignments = mocks.assignments; textbooks = mocks.textbooks; skill = mocks.skill; skillState = mocks.skillState;
} }));
import { POST } from "@/app/api/tutor/route";
beforeEach(() => {
  vi.resetAllMocks();
  const query: Record<string, unknown> = {};
  for (const method of ["select","eq","or","limit","order","maybeSingle"]) query[method] = () => query;
  query.then = (resolve: (value: unknown) => void) => resolve({data: [], error: null});
  mocks.auth.mockResolvedValue({from: () => query});
  mocks.child.mockResolvedValue({ id: "child", name: "Test learner", grade: 6 });
  mocks.activeEnrollment.mockResolvedValue({ id: "e", grade: 8, academic_year_id: "2027-28", curriculum_program_id: "program", program_confirmed: true });
  mocks.year.mockResolvedValue({ id: "2027-28", label: "2027/28" });
  mocks.program.mockResolvedValue({ id: "program", name: "Test program" });
  mocks.assignments.mockResolvedValue([]); mocks.textbooks.mockResolvedValue([]);
  mocks.generate.mockResolvedValue(JSON.stringify({ answer: "Посмотри на условие задания.", correctness: "unknown" }));
});
afterEach(() => vi.clearAllMocks());
function request(body: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/tutor", { method: "POST", headers: { Authorization: "Bearer test-session" },
    body: JSON.stringify({ childId: "child", subject: "math", courseId: "math.geometry", mode: "topic", message: "Разберём тему", ...body }) });
}
it("uses authenticated active enrollment and selected course in the actual tutor prompt", async () => {
  const response = await POST(request()); expect(response.status).toBe(200);
  const prompt = mocks.generate.mock.calls[0][0].messages[0].text;
  expect(prompt).toContain("Test learner"); expect(prompt).toContain("8 класса"); expect(prompt).toContain("Геометрия");
  expect(prompt).toContain("2027/28"); expect(prompt).not.toContain("6 класса");
});
it("keeps legacy child grade fallback and informatics on the shared tutor route", async () => {
  mocks.activeEnrollment.mockResolvedValue(null);
  const response = await POST(request({ subject: "informatics", courseId: undefined }));
  expect(response.status).toBe(200);
  const prompt = mocks.generate.mock.calls[0][0].messages[0].text;
  expect(prompt).toContain("6 класса"); expect(prompt).toContain("Информатика");
});
it("does not load a child's context without a verified parent's session", async () => {
  mocks.auth.mockResolvedValue(null);
  const response = await POST(request());
  expect(response.status).toBe(401); expect(mocks.child).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
});
it("rejects a course outside the subject before generation", async () => {
  expect((await POST(request({ courseId: "history.world" }))).status).toBe(400);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("repairs invalid generator JSON once and never exposes it to the learner",async()=>{
 mocks.generate.mockResolvedValue('```json {broken');
 const response=await POST(request());expect(response.status).toBe(200);
 expect((await response.json()).answer).not.toContain("broken");expect(mocks.generate).toHaveBeenCalledTimes(2);
});
