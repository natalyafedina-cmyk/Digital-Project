import { beforeEach, expect, it, vi } from "vitest";
import data from "@/lib/curriculum/catalog-data.json";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  generate: vi.fn(),
  context: vi.fn(),
  rpc: vi.fn(),
  session: {} as Record<string, unknown>,
  links: [] as unknown[],
}));
vi.mock("@/lib/supabase/request-client", () => ({
  authenticatedRequestClient: m.auth,
}));
vi.mock("@/lib/providers", () => ({
  createLLMProvider: () => ({ generate: m.generate }),
  createVisionProvider: vi.fn(),
  withFailover: async (fn: (s: AbortSignal) => unknown) =>
    fn(new AbortController().signal),
}));
vi.mock("@/lib/curriculum/learning-context", () => ({
  getActiveLearningContext: m.context,
  renderAcademicContext: () => "Учебный контекст",
}));
vi.mock("@/lib/curriculum/repository", () => ({
  SupabaseCurriculumRepository: class {},
}));
import { POST } from "@/app/api/tutor/route";
const skill = "math.algebra.linear_equation.basic";
const raw = {
  turnKind: "new_goal",
  requestedActions: ["explain", "practice"],
  courseId: "math.algebra",
  curriculumUnitId: data.curriculum_units[0].id,
  skillId: skill,
  confidence: 0.95,
  explicitConstraints: {
    doNotRevealSolution: true,
    wantsFreshTask: true,
    wantsVisual: false,
    concise: true,
  },
  needsClarification: false,
};
beforeEach(() => {
  vi.resetAllMocks();
  m.links = [];
  m.session = {
    id: "session",
    subject: "math",
    course_id: null,
    lesson_state: null,
  };
  m.context.mockResolvedValue({
    child: { id: "child", name: "Test", grade: 7 },
    grade: 7,
    program: { id: "ru.fgos_ooo.base" },
    course: null,
  });
  m.auth.mockResolvedValue({
    rpc: m.rpc,
    from: (table: string) => {
      let operation = "read",
        payload: Record<string, unknown> = {};
      const filter: Record<string, unknown> = {};
      const q: Record<string, unknown> = {};
      for (const method of [
        "select",
        "limit",
        "order",
        "or",
        "in",
        "maybeSingle",
        "single",
        "abortSignal",
      ])
        q[method] = () => q;
      q.eq = (key: string, value: unknown) => {
        filter[key] = value;
        return q;
      };
      q.update = (p: Record<string, unknown>) => {
        operation = "update";
        payload = p;
        return q;
      };
      q.insert = (p: Record<string, unknown>) => {
        operation = "insert";
        payload = p;
        return q;
      };
      q.then = (resolve: (v: unknown) => void) => {
        let result: unknown = [];
        if (table === "study_sessions") {
          if (operation === "update") Object.assign(m.session, payload);
          result = m.session;
        }
        // Real skills, filter course from .or expression and honor bounded query.
        if (table === "skills")
          result = data.skills
            .filter(
              (s) =>
                s.subject_id === filter.subject_id &&
                (!s.course_id || s.course_id === filter.course),
            )
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, 12);
        if (table === "curriculum_units")
          result = data.curriculum_units
            .filter(
              (u) =>
                u.course_id === filter.course_id &&
                u.program_id === filter.program_id &&
                u.grade === filter.grade,
            )
            .slice(0, 12);
        if (table === "session_skills" && operation === "insert")
          m.links.push(payload);
        resolve({ data: result, error: null });
      };
      q.or = (expression: string) => {
        filter.course = expression.match(/course_id.eq.([^,]+)/)?.[1];
        return q;
      };
      return q;
    },
  });
  m.rpc.mockResolvedValue({ data: null, error: null });
});
const req = (message: string) =>
  new Request("http://local/api/tutor", {
    method: "POST",
    body: JSON.stringify({
      childId: "child",
      sessionId: "session",
      subject: "math",
      mode: "practice",
      message,
      turnId: "turn",
      supportStage: 4,
    }),
  });
const generated = (prompt: string) =>
  JSON.stringify({
    answer:
      "Неизвестное входит в первой степени. Значение делает равенство верным.",
    taskBlock: { prompt },
    teachingMethod: "dialogue",
    hintLevel: 0,
  });
it("exact catalog skill resolves without semantic resolver and persists course/skill/task", async () => {
  m.generate.mockResolvedValueOnce(generated("Реши: 4x + 7 = 19."));
  const first = await POST(
    req(
      "Объясни мне простыми словами, что такое линейное уравнение, но не решай за меня. Потом дай один простой пример, который я попробую решить сама.",
    ),
  );
  expect(first.status).toBe(200);
  const r = await first.json();
  expect(r.taskBlock.prompt).toContain("4x");
  expect(r.nextSupportStage).toBe(0);
  expect(r.pedagogyDecision.actions).toEqual([
    "explain_concept",
    "give_practice_task",
  ]);
  expect(m.session.course_id).toBe("math.algebra");
  expect(m.session.target_skill_id).toBe(skill);
  expect(m.session.target_curriculum_unit_id).toBe(null);
  expect(m.session.lesson_phase).toBe("await_attempt");
  expect(m.links).toContainEqual({
    session_id: "session",
    skill_id: skill,
    role: "target",
  });
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.generate).toHaveBeenCalledTimes(1);
  m.generate
    .mockResolvedValueOnce(
      JSON.stringify({
        attemptKind: "answer",
        correctness: "correct",
        confidence: 0.95,
        skillIds: [skill],
        prerequisiteSkillIds: [],
        errorClasses: [],
        evidenceSummary: "Learner independently solved current task",
      }),
    )
    .mockResolvedValueOnce(generated("Реши: 5x + 2 = 22."));
  const next = await POST(req("Мой ответ: x = 3"));
  expect(next.status).toBe(200);
  const n = await next.json();
  expect(n.pedagogyDecision.actions).toEqual(["verify_independence"]);
  expect(n.lessonState.phase).toBe("verify_independence");
  expect(m.generate.mock.calls[1][0].messages[1].text).toContain("4x + 7 = 19");
  expect(m.rpc).toHaveBeenCalledWith(
    "record_skill_evidence",
    expect.objectContaining({
      p_skill_id: skill,
      p_support_stage: 0,
      p_correctness: "correct",
    }),
  );
  expect(m.generate).toHaveBeenCalledTimes(3);
});
it("ambiguous general math request asks clarification without generic generator", async () => {
  m.generate.mockResolvedValueOnce(
    JSON.stringify({ ...raw, courseId: null, skillId: null, confidence: 0.3 }),
  );
  const response = await POST(req("Помоги с новой темой"));
  expect(response.status).toBe(200);
  const r = await response.json();
  expect(r.lessonState.phase).toBe("clarify");
  expect(r.lessonState.pendingClarification.originalRequestText).toBe(
    "Помоги с новой темой",
  );
  expect(r.taskBlock).toBe(null);
  expect(r.answer).toContain("Что именно");
  expect(m.generate).toHaveBeenCalledTimes(1);
  expect(m.rpc).not.toHaveBeenCalled();
});

it("course clarification resumes the original goal without a second semantic resolver call", async () => {
  const original =
    "Объясни мне эту тему простыми словами и потом дай один простой пример, который я попробую решить сама.";

  m.generate.mockResolvedValueOnce(
    JSON.stringify({
      ...raw,
      courseId: null,
      curriculumUnitId: null,
      skillId: null,
      confidence: 0.3,
    }),
  );

  const first = await POST(req(original));
  expect(first.status).toBe(200);
  const clarificationResponse = await first.json();
  expect(clarificationResponse.lessonState.phase).toBe("clarify");
  expect(
    clarificationResponse.lessonState.pendingClarification.originalRequestText,
  ).toBe(original);

  m.generate.mockResolvedValueOnce(generated("Реши: 4x + 7 = 19."));

  const second = await POST(req("алгебра"));
  expect(second.status).toBe(200);
  const resumed = await second.json();

  expect(resumed.answer).not.toContain("Что именно разбираем");
  expect(resumed.requestResolution.courseId).toBe("math.algebra");
  expect(resumed.requestResolution.requestedActions).toEqual([
    "explain",
    "practice",
  ]);
  expect(resumed.pedagogyDecision.actions).toEqual([
    "explain_concept",
    "give_practice_task",
  ]);
  expect(resumed.taskBlock.prompt).toContain("4x");
  expect(resumed.lessonState.phase).toBe("await_attempt");
  expect(resumed.lessonState.pendingClarification).toBe(null);
  expect(m.session.course_id).toBe("math.algebra");
  expect(m.session.target_skill_id).toBe(null);
  expect(m.generate).toHaveBeenCalledTimes(2);
});
function existingTask(stage = 0) {
  m.session = {
    ...m.session,
    course_id: "math.algebra",
    target_skill_id: skill,
    lesson_state: {
      version: 1,
      target: {
        subjectId: "math",
        courseId: "math.algebra",
        curriculumUnitId: null,
        skillId: skill,
      },
      phase: "await_attempt",
      supportStage: stage,
      expectedLearnerAction: "attempt_task",
      lastTask: { text: "4x + 7 = 19", skillId: skill },
      previousMethod: "dialogue",
      failedMethods: [],
      pendingIndependentVerification: false,
      resumeTargetSkillId: null,
    },
  };
}
it("wrong answer produces narrow stage-zero retry, no solution, retains exact task", async () => {
  existingTask();
  m.generate
    .mockResolvedValueOnce(
      JSON.stringify({
        attemptKind: "answer",
        correctness: "incorrect",
        confidence: 0.95,
        skillIds: [skill],
        prerequisiteSkillIds: [],
        errorClasses: ["sign_error"],
        evidenceSummary: "Observable wrong step",
      }),
    )
    .mockResolvedValueOnce(
      JSON.stringify({
        answer: "Проверь знак в своём шаге.",
        teachingMethod: "dialogue",
      }),
    );
  const response = await POST(req("Мой ответ: x = 5"));
  expect(response.status).toBe(200);
  const r = await response.json();
  expect(r.lessonState.phase).toBe("retry");
  expect(r.nextSupportStage).toBe(0);
  expect(r.taskBlock).toBe(null);
  expect(r.answer).not.toMatch(/x\s*=/);
  expect(r.lessonState.lastTask.text).toBe("4x + 7 = 19");
  expect(m.rpc).toHaveBeenCalledWith(
    "record_skill_evidence",
    expect.objectContaining({ p_correctness: "incorrect", p_support_stage: 0 }),
  );
});
it("no idea advances one stage, hinted success records old stage then resets for fresh verification", async () => {
  existingTask();
  m.generate.mockResolvedValueOnce(
    JSON.stringify({
      answer: "Подумай, какую операцию нужно отменить первой.",
      teachingMethod: "dialogue",
    }),
  );
  const hint = await POST(req("Не знаю"));
  expect(hint.status).toBe(200);
  expect((await hint.json()).nextSupportStage).toBe(1);
  expect(m.generate).toHaveBeenCalledTimes(1);
  expect(m.rpc).not.toHaveBeenCalled();
  m.generate
    .mockResolvedValueOnce(
      JSON.stringify({
        attemptKind: "answer",
        correctness: "correct",
        confidence: 0.95,
        skillIds: [skill],
        prerequisiteSkillIds: [],
        errorClasses: [],
        evidenceSummary: "Correct after hint",
      }),
    )
    .mockResolvedValueOnce(generated("Реши: 2x + 3 = 11."));
  const correct = await POST(req("Мой ответ: x = 3"));
  expect(correct.status).toBe(200);
  const r = await correct.json();
  expect(r.nextSupportStage).toBe(0);
  expect(r.lessonState.phase).toBe("verify_independence");
  expect(m.rpc).toHaveBeenCalledWith(
    "record_skill_evidence",
    expect.objectContaining({ p_support_stage: 1 }),
  );
});
it("low STT asks to confirm without semantic calls, failures or escalation", async () => {
  existingTask(2);
  const response = await POST(
    new Request("http://local/api/tutor", {
      method: "POST",
      body: JSON.stringify({
        childId: "child",
        sessionId: "session",
        subject: "math",
        mode: "practice",
        message: "Мой ответ: 9",
        sttConfidence: 0.4,
        inputModality: "voice",
      }),
    }),
  );
  expect(response.status).toBe(200);
  const r = await response.json();
  expect(r.nextSupportStage).toBe(2);
  expect(r.lessonState.expectedLearnerAction).toBe("confirm_transcript");
  expect(m.generate).not.toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalled();
});
