import { expect, it, vi } from "vitest";
import data from "@/lib/curriculum/catalog-data.json";
import { COURSES } from "@/lib/curriculum/catalog";
import {
  resolveLearningRequest,
  validateResolution,
  reuseResolution,
} from "@/lib/learning-request/resolver";
import {
  initialState,
  acceptedState,
  readState,
} from "@/lib/pedagogy/lesson-state";
import { planPedagogy } from "@/lib/pedagogy/planner";
import { unknownAnalysis, analyzeLearnerTurn } from "@/lib/learning-analysis";
import { deterministicCritic } from "@/lib/response-critic";
import { summarizeEvidence } from "@/lib/evidence-engine";
import type { RequestCatalog } from "@/lib/learning-request/types";
import type { TurnAnalysis } from "@/lib/learning-analysis";
const target = {
  subjectId: "math",
  courseId: "math.algebra",
  curriculumUnitId: null,
  skillId: "math.algebra.linear_equation.basic",
};
const catalog: RequestCatalog = {
  courses: COURSES.filter((c) => c.subjectId === "math"),
  units: [],
  skills: data.skills.filter((s) => s.course_id === "math.algebra"),
};
const raw = {
  ...target,
  turnKind: "new_goal",
  requestedActions: ["explain", "practice"],
  confidence: 0.95,
  explicitConstraints: {
    doNotRevealSolution: true,
    wantsFreshTask: true,
    wantsVisual: false,
    concise: true,
  },
  needsClarification: false,
  clarificationQuestion: null,
};
const request = () => validateResolution(raw, "math", catalog);
const unknown = unknownAnalysis(
  { text: "", subjectId: "math", courseId: "math.algebra", candidates: [] },
  "non_attempt",
);
const attempt = (
  correctness: TurnAnalysis["correctness"] = "correct",
): TurnAnalysis => ({
  ...unknown,
  attemptKind: "answer",
  correctness,
  confidence: 0.95,
  skillIds: [target.skillId],
  learningEvidenceEligible: true,
  evidenceSummary: "observable answer",
  uncertaintyReason: null,
});
it("exact regression resolves before an attempt and preserves explanation + fresh task", async () => {
  const text =
    "Объясни мне простыми словами, что такое линейное уравнение, но не решай за меня. Потом дай один простой пример, который я попробую решить сама.";
  const llm = { generate: vi.fn().mockResolvedValue(JSON.stringify(raw)) };
  const r = await resolveLearningRequest(llm, {
    text,
    subjectId: "math",
    catalog,
  });
  expect(r.courseId).toBe(target.courseId);
  expect(r.skillId).toBe(target.skillId);
  expect(r.requestedActions).toEqual(["explain", "practice"]);
  const s = initialState({ ...target, courseId: null, skillId: null });
  const d = planPedagogy({
    request: r,
    state: s,
    analysis: unknown,
    rules: [],
  });
  expect(d.actions).toEqual(["explain_concept", "give_practice_task"]);
  expect(d.nextPhase).toBe("await_attempt");
  expect(d.supportStage).toBe(0);
  expect(d.responseConstraints.doNotRevealSolution).toBe(true);
  const task = {
    prompt: "Реши самостоятельно: 4x + 7 = 19.",
    skillId: target.skillId,
  };
  expect(
    deterministicCritic(
      {
        answer: "В таком уравнении неизвестное входит в первой степени.",
        taskBlock: task,
        visualBlock: null,
        teachingMethod: d.teachingMethod,
        hintLevel: 0,
      },
      {
        decision: d,
        requestResolution: r,
        stage: 0,
        sourceText: text,
        taskGeneration: true,
        wantsVisual: false,
        english: false,
        mustChangeMethod: false,
        previousMethod: null,
        analysis: unknown,
        rules: [],
      },
    ),
  ).toEqual([]);
  const next = acceptedState(s, d, task);
  expect(next.target).toEqual(target);
  expect(next.lastTask?.text).toBe(task.prompt);
  expect(next.expectedLearnerAction).toBe("attempt_task");
});
for (const [key, value] of [
  ["courseId", "invented"],
  ["curriculumUnitId", "invented"],
  ["skillId", "invented"],
  ["confidence", 1.2],
  ["confidence", NaN],
  ["requestedActions", ["invented"]],
] as const)
  it(`rejects invalid ${key}`, () =>
    expect(
      validateResolution({ ...raw, [key]: value }, "math", catalog)
        .needsClarification,
    ).toBe(true));
it("explicit UI course is binding and single course auto resolves", () => {
  expect(
    validateResolution(raw, "math", catalog, "math.geometry")
      .needsClarification,
  ).toBe(true);
  expect(
    validateResolution({ ...raw, courseId: null, skillId: null }, "english", {
      courses: COURSES.filter((c) => c.subjectId === "english"),
      units: [],
      skills: [],
    }).courseId,
  ).toBe("english.language");
});
it("resolver failure asks clarification or reuses existing target", async () => {
  const llm = { generate: vi.fn().mockRejectedValue(Error("offline")) };
  expect(
    (
      await resolveLearningRequest(llm, {
        text: "Помоги с новой темой",
        subjectId: "math",
        catalog,
      })
    ).needsClarification,
  ).toBe(true);
  expect(
    (
      await resolveLearningRequest(llm, {
        text: "Мой ответ: 3",
        subjectId: "math",
        catalog,
        target,
      })
    ).skillId,
  ).toBe(target.skillId);
});
const cases = [
  ["explanation", ["explain"], unknown, 0, undefined, ["explain_concept"], 0],
  [
    "explain practice",
    ["explain", "practice"],
    unknown,
    0,
    undefined,
    ["explain_concept", "give_practice_task"],
    0,
  ],
  ["practice", ["practice"], unknown, 0, undefined, ["give_practice_task"], 0],
  ["independent", [], attempt(), 0, undefined, ["verify_independence"], 0],
  ["hinted", [], attempt(), 2, undefined, ["verify_independence"], 0],
  ["wrong", [], attempt("incorrect"), 0, undefined, ["ask_for_attempt"], 0],
  ["hint", ["ask_for_hint"], unknown, 0, undefined, ["give_small_hint"], 1],
  [
    "repeated error",
    [],
    attempt("incorrect"),
    1,
    undefined,
    ["give_small_hint"],
    1,
  ],
  [
    "change method",
    ["change_method"],
    unknown,
    1,
    undefined,
    ["change_representation"],
    1,
  ],
  ["mastered", ["practice"], unknown, 0, "mastered", ["give_transfer_task"], 0],
  [
    "nearly mastered",
    ["practice"],
    unknown,
    0,
    "nearly_mastered",
    ["give_transfer_task"],
    0,
  ],
  [
    "needs review",
    ["practice"],
    unknown,
    0,
    "needs_review",
    ["ask_diagnostic_question"],
    0,
  ],
] as const;
for (const [
  name,
  actions,
  analysis,
  stage,
  skillStatus,
  expected,
  nextStage,
] of cases)
  it(`stateful ${name}`, () => {
    const s = {
      ...initialState(target),
      supportStage: stage,
      previousMethod: "dialogue",
    };
    const d = planPedagogy({
      request: { ...request(), requestedActions: [...actions] },
      state: s,
      analysis,
      skillStatus,
      rules: [],
    });
    expect(d.actions).toEqual(expected);
    expect(d.supportStage).toBe(nextStage);
    if (name === "change method")
      expect(d.teachingMethod).not.toBe(s.previousMethod);
  });
it("prerequisite detour remembers original target and returns after success", () => {
  const s = initialState(target),
    a = {
      ...attempt("incorrect"),
      errorClasses: ["prerequisite_gap"],
      prerequisiteSkillIds: [catalog.skills[0].id],
    };
  const d = planPedagogy({
    request: request(),
    state: s,
    analysis: a,
    rules: [],
  });
  expect(d.resumeTarget).toEqual(target);
  const detour = acceptedState(s, d, {
    prompt: "Проверь предпосылку",
    skillId: d.target.skillId,
  });
  const returned = planPedagogy({
    request: { ...request(), ...detour.target, turnKind: "learner_attempt" },
    state: detour,
    analysis: attempt(),
    rules: [],
  });
  expect(returned.target).toEqual(target);
  expect(returned.resumeTarget).toBe(null);
});
it("low STT preserves stage, task and knowledge", () => {
  const s = { ...initialState(target), supportStage: 2 as const };
  const d = planPedagogy({
    request: request(),
    state: s,
    analysis: unknown,
    rules: [],
    sttConfidence: 0.4,
  });
  expect(d.actions).toEqual(["confirm_transcript"]);
  expect(d.supportStage).toBe(2);
});
it("new topic resets support and task, restoration preserves compact state", () => {
  const s = {
    ...initialState(target),
    supportStage: 3 as const,
    lastTask: { text: "old", skillId: target.skillId },
  };
  const r = {
    ...request(),
    courseId: "math.geometry",
    skillId: "math.geometry.angles",
  };
  const d = planPedagogy({
    request: r,
    state: s,
    analysis: unknown,
    rules: [],
  });
  expect(d.supportStage).toBe(0);
  const next = acceptedState(s, d, { prompt: "new", skillId: r.skillId });
  expect(readState(next, next.target)).toEqual(next);
  expect(readState({}, target).phase).toBe("orient");
});
it("analyzer evaluates persisted task, independent success differs from hinted", async () => {
  const llm = {
    generate: vi.fn().mockResolvedValue(JSON.stringify(attempt())),
  };
  const a = await analyzeLearnerTurn(llm, {
    text: "Мой ответ: x = 3",
    subjectId: "math",
    courseId: target.courseId,
    candidates: catalog.skills,
    previousTask: "4x + 7 = 19",
  });
  expect(a.learningEvidenceEligible).toBe(true);
  expect(llm.generate.mock.calls[0][0].messages[1].text).toContain(
    "4x + 7 = 19",
  );
  expect(
    summarizeEvidence([
      {
        correctness: "correct",
        supportStage: 0,
        sessionId: "s",
        date: "2026-10-13",
      },
    ]).status,
  ).not.toBe("mastered");
});
for (const course of COURSES.filter((c) =>
  ["math", "history"].includes(c.subjectId),
))
  it(`semantic catalog selection ${course.id}`, async () => {
    const skills = data.skills.filter((s) => s.course_id === course.id);
    const r = { ...raw, courseId: course.id, skillId: skills[0]?.id || null };
    const result = await resolveLearningRequest(
      { generate: vi.fn().mockResolvedValue(JSON.stringify(r)) },
      {
        text: "Учебный запрос из fixture",
        subjectId: course.subjectId,
        catalog: {
          courses: COURSES.filter((c) => c.subjectId === course.subjectId),
          units: [],
          skills,
        },
      },
    );
    expect(result.courseId).toBe(course.id);
  });
it("reuse does not require a resolver call for expected answer", () =>
  expect(reuseResolution(target, "Мой ответ: 3").turnKind).toBe(
    "learner_attempt",
  ));
it("plan-aware critic rejects missing task, solution, hint, empty explanation and missing visual", () => {
  const d = planPedagogy({
    request: request(),
    state: initialState(target),
    analysis: unknown,
    rules: [],
  });
  const c = {
    decision: d,
    stage: 0,
    sourceText: "",
    taskGeneration: true,
    wantsVisual: false,
    english: false,
    mustChangeMethod: false,
    previousMethod: null,
    analysis: unknown,
    rules: [],
  };
  const base = {
    answer: "Объяснение",
    taskBlock: null,
    visualBlock: null,
    teachingMethod: "dialogue",
    hintLevel: 0,
  };
  expect(deterministicCritic(base, c)).toContain("missing_fresh_task");
  expect(
    deterministicCritic(
      { ...base, taskBlock: { prompt: "Ответ: 3", skillId: null } },
      c,
    ),
  ).toContain("premature_answer");
  expect(
    deterministicCritic(
      { ...base, taskBlock: { prompt: "Сначала вычти число", skillId: null } },
      c,
    ),
  ).toContain("task_contains_help");
  expect(deterministicCritic({ ...base, answer: "" }, c)).toContain(
    "missing_explanation",
  );
  expect(deterministicCritic(base, { ...c, wantsVisual: true })).toContain(
    "format_mismatch",
  );
  expect(
    deterministicCritic(base, {
      ...c,
      mustChangeMethod: true,
      previousMethod: "dialogue",
    }),
  ).toContain("reused_failed_method");
});
it('English transcript confirmation and target clarification do not require an English attempt yet',()=>{
 const r=request(),s=initialState(target);
 const d=planPedagogy({request:r,state:s,analysis:unknown,rules:[],sttConfidence:.4});
 expect(deterministicCritic({answer:'Проверь распознанный текст.',taskBlock:null,visualBlock:null,teachingMethod:d.teachingMethod,hintLevel:d.supportStage},{decision:d,stage:0,sourceText:'',taskGeneration:false,wantsVisual:false,english:true,mustChangeMethod:false,previousMethod:null,analysis:unknown,rules:[]})).toEqual([]);
});
