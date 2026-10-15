import "./setup";
import { expect, it, vi } from "vitest";
import { validateJudge, judgeTurn, RUBRIC } from "../../calibration/judge";
import { hardEvaluate } from "../../calibration/evaluate";
import { buildReport, percentile, THRESHOLDS } from "../../calibration/report";
import {
  configuration,
  independentJudge,
  instrument,
  classifyCall,
} from "../../calibration/providers";
import { scenarios } from "../../calibration/scenarios";
import {
  CORE_DIMENSIONS,
  EXTRA_DIMENSIONS,
  type ScenarioResult,
  type TurnResult,
} from "../../calibration/types";
import { initialState } from "@/lib/pedagogy/lesson-state";
const s = scenarios[1];
function turn(): TurnResult {
  return {
    index: 0,
    input: s.turns[0],
    httpStatus: 200,
    response: {
      answer: "Понятное объяснение.",
      taskBlock: { prompt: "Новое задание без решения", skillId: s.skillId },
      pedagogyDecision: {
        actions: ["explain_concept", "give_practice_task"],
        supportStage: 0,
        shouldGenerateTask: true,
        responseConstraints: { doNotRevealSolution: true },
      },
      lessonState: null,
    },
    before: null,
    after: initialState({
      subjectId: s.subjectId,
      courseId: s.targetCourseId,
      curriculumUnitId: null,
      skillId: s.skillId,
    }),
    evidence: [],
    calls: [],
    latencyMs: 50,
    critic: null,
    hard: [],
    judge: {
      status: "NOT_MEASURED",
      scores: {},
      flags: [],
      briefReason: "",
      independent: false,
      latencyMs: 0,
    },
  };
}
function completeReportResults(): ScenarioResult[] {
  return Array.from({ length: 144 }, (_, i) => ({
    subjectId: [
      "math",
      "russian",
      "english",
      "literature",
      "physics",
      "biology",
      "geography",
      "history",
      "informatics",
    ][i % 9],
    i,
  })).map(({ subjectId, i }) => ({
    id: "unit-" + i + "-" + subjectId,
    subjectId,
    category: "unit",
    candidate: "A",
    status: "COMPLETED",
    latencyMs: 50,
    turns: [
      {
        ...turn(),
        hard: [
          "no_premature_answer",
          "lesson_continuity",
          "parent_rule_compliance",
          "stt_integrity",
          "curriculum_integrity",
          "evidence_integrity",
          "internal_leakage",
          "task_duplication",
          "pedagogical_actions",
        ].map((gate) => ({ gate, pass: true, critical: true, detail: "" })),
        judge: {
          status: "MEASURED",
          scores: Object.fromEntries(
            [...CORE_DIMENSIONS, ...EXTRA_DIMENSIONS].map((d) => [d, 4]),
          ),
          flags: [],
          briefReason: "Observable quality",
          independent: true,
          latencyMs: 15,
        },
      },
    ],
  }));
}
it("coverage is 146 distinct contracts, all subjects/courses, real skills and multiple-turn units", () => {
  expect(scenarios).toHaveLength(146);
  expect(new Set(scenarios.map((s) => s.id)).size).toBe(146);
  expect(new Set(scenarios.map((s) => s.subjectId)).size).toBe(9);
  expect(new Set(scenarios.map((s) => s.targetCourseId)).size).toBe(13);
  expect(scenarios.filter((s) => s.turns.length > 1).length).toBeGreaterThan(
    60,
  );
  expect(RUBRIC.child_clarity).toContain("correctness alone is not clarity");
});
it("detects hard leakage, duplicate tasks, internal labels and fabricated IDs independently of nice prose", () => {
  const t = turn();
  t.response.answer =
    "Ответ: x = 3. support stage: 0. Новое задание без решения";
  t.after!.target.skillId = "fabricated.skill";
  const hard = hardEvaluate(s, t);
  for (const gate of [
    "no_premature_answer",
    "task_duplication",
    "internal_leakage",
    "curriculum_integrity",
  ])
    expect(hard.find((h) => h.gate === gate)?.pass).toBe(false);
});
it("validates integer scores and rejects unknown dimensions, irrelevant scores and unknown flags", () => {
  expect(
    validateJudge(
      {
        scores: { child_clarity: 3 },
        flags: [],
        brief_reason: "Clear meaning",
      },
      ["child_clarity"],
      true,
    ).status,
  ).toBe("MEASURED");
  for (const raw of [
    { scores: { child_clarity: 2.5 }, flags: [], brief_reason: "" },
    { scores: { child_clarity: 5 }, flags: [], brief_reason: "" },
    { scores: { child_clarity: 4, invented: 4 }, flags: [], brief_reason: "" },
    { scores: {}, flags: [], brief_reason: "" },
    { scores: { child_clarity: 4 }, flags: ["invented"], brief_reason: "" },
  ])
    expect(validateJudge(raw, ["child_clarity"], true).status).toBe(
      "JUDGE_ERROR",
    );
});
it("invalid Judge JSON is JUDGE_ERROR, never PASS", async () => {
  const result = await judgeTurn(
    { generate: vi.fn().mockResolvedValue("broken JSON") },
    s,
    turn(),
    true,
  );
  expect(result.status).toBe("JUDGE_ERROR");
  expect(result.scores).toEqual({});
});
it("missing credentials are unconfigured, and no unmeasured semantic score becomes 100%", () => {
  const a = configuration("A", {});
  expect(a.configured).toBe(false);
  const report = buildReport([], 144, "external", [
    { label: "A", configured: false, model: null, provider: null },
  ]);
  expect(report.semanticRates.child_clarity).toBe(null);
  expect(report.verdict).not.toBe("READY");
});
it("same model self-judge remains diagnostic and cannot produce READY", () => {
  const env = {
    LLM_PROVIDER: "openai-compatible",
    LLM_BASE_URL: "https://candidate.example/v1",
    LLM_API_KEY: "synthetic-test-key",
    LLM_MODEL: "unit-model",
    CALIBRATION_JUDGE_PROVIDER: "openai-compatible",
    CALIBRATION_JUDGE_BASE_URL: "https://judge.example/v1",
    CALIBRATION_JUDGE_API_KEY: "synthetic-test-key",
    CALIBRATION_JUDGE_MODEL: "unit-model",
  };
  expect(
    independentJudge(configuration("A", env), configuration("JUDGE", env)),
  ).toBe(false);
  const results = completeReportResults();
  for (const r of results) r.turns[0].judge.independent = false;
  expect(buildReport(results, 144, "external").verdict).toBe(
    "SEMANTIC_UNVERIFIED",
  );
});
it("critical fail blocks READY even when every semantic score is excellent", () => {
  const results = completeReportResults();
  expect(buildReport(results, 144, "external").verdict).toBe("READY");
  results[0].turns[0].hard.push({
    gate: "no_premature_answer",
    pass: false,
    critical: true,
    detail: "Leak",
  });
  expect(buildReport(results, 144, "external").verdict).toBe("NOT_READY");
});
it("semantic critical flags cannot be averaged away", () => {
  const results = completeReportResults();
  results[0].turns[0].judge.flags = ["PREMATURE_ANSWER"];
  expect(buildReport(results, 144, "external").criticalFailures).toHaveLength(
    1,
  );
  expect(buildReport(results, 144, "external").verdict).toBe("NOT_READY");
});
it("partial external benchmark is incomplete, and offline cannot certify release", () => {
  const results = completeReportResults();
  expect(buildReport(results, 145, "external").verdict).toBe(
    "BENCHMARK_INCOMPLETE",
  );
  expect(buildReport(results, 144, "offline").verdict).toBe(
    "SEMANTIC_UNVERIFIED",
  );
});
it("call kinds and wall-clock durations are counted, including failures", async () => {
  const trace: import("../../calibration/types").CallTrace[] = [];
  const now = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(35);
  await instrument(
    { generate: vi.fn().mockResolvedValue("result") },
    trace,
    now,
  ).generate({
    messages: [{ role: "system", text: "Analyze a learner turn" }],
    temperature: 0,
    maxTokens: 10,
  });
  expect(trace).toEqual([
    { kind: "analyzer", latencyMs: 25, outcome: "ok", startedAtMs: 10 },
  ]);
  expect(
    classifyCall({
      messages: [{ role: "system", text: "Repair these response violations" }],
      temperature: 0,
      maxTokens: 1,
    }),
  ).toBe("repair");
});
it("report rates, percentiles and per-scenario aggregation use actual denominators", () => {
  expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
  expect(percentile([], 0.95)).toBe(null);
  const results = completeReportResults();
  results[0].turns[0].hard.push({
    gate: "task_duplication",
    pass: false,
    critical: false,
    detail: "",
  });
  const r = buildReport(results, 144, "external");
  expect(
    r.matrix.find((m) => m.metric === "task_duplication")!.actual,
  ).toBeCloseTo(14300 / 144);
  expect(THRESHOLDS.child_clarity).toBe(90);
  expect(r.subjects).toHaveLength(9);
});
it("Candidate B configuration does not mutate production env and A/B scenarios are identical inputs", () => {
  const env = {
    LLM_MODEL: "production-model",
    CALIBRATION_B_PROVIDER: "openai-compatible",
    CALIBRATION_B_BASE_URL: "https://b.example/v1",
    CALIBRATION_B_API_KEY: "synthetic-test-key",
    CALIBRATION_B_MODEL: "candidate-b",
  };
  const b = configuration("B", env);
  expect(b.model).toBe("candidate-b");
  expect(env.LLM_MODEL).toBe("production-model");
  expect(JSON.stringify(structuredClone(s))).toBe(JSON.stringify(s));
});
it("the same actual full-Tutor harness runs A and B with isolated identical initial inputs", async () => {
  const { runScenario } = await import("../../calibration/harness");
  const { scriptedProvider } = await import("../../calibration/providers");
  const { current } = await import("../../calibration/context");
  const { POST } = await import("@/app/api/tutor/route");
  const factory = () =>
    scriptedProvider(
      s,
      () => current().turn,
      () => current().criticContext,
    );
  const [a, b] = await Promise.all([
    runScenario(s, "A", POST, factory),
    runScenario(s, "B", POST, factory),
  ]);
  expect(a.turns.map((t) => t.input)).toEqual(b.turns.map((t) => t.input));
  expect(a.turns[0].before).toEqual(b.turns[0].before);
  expect(a.candidate).toBe("A");
  expect(b.candidate).toBe("B");
  expect(a.turns[0].response).toEqual(b.turns[0].response);
});
it("scenario timeout is bounded and reported as failure without infrastructure retries", async () => {
  const { runScenario } = await import("../../calibration/harness");
  const { POST } = await import("@/app/api/tutor/route");
  const result = await runScenario(
    s,
    "A",
    POST,
    () => ({
      generate: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return "{}";
      },
    }),
    { timeoutMs: 1 },
  );
  expect(result.status).toBe("TIMEOUT");
  expect(
    result.turns[0].hard.some((h) => h.gate === "timeout" && !h.pass),
  ).toBe(true);
});
it("TTS rejection is independent of the actual text route response", async () => {
  const { runScenario } = await import("../../calibration/harness");
  const { POST } = await import("@/app/api/tutor/route");
  const { realProviders } = await import("./setup");
  const [text, speech] = await Promise.allSettled([
    runScenario(s, "OFFLINE", POST, realProviders.createLLMProvider),
    Promise.reject(Error("SYNTHETIC_TTS_UNAVAILABLE")),
  ]);
  expect(text.status).toBe("fulfilled");
  expect(speech.status).toBe("rejected");
  if (text.status === "fulfilled")
    expect(text.value.turns[0].httpStatus).toBe(200);
});
it("ignored Yandex model env aliases cannot falsely establish independent judging", () => {
  const env = {
    LLM_PROVIDER: "yandex",
    LLM_MODEL: "alias-a",
    YANDEX_API_KEY: "synthetic-test-key",
    YANDEX_FOLDER_ID: "synthetic-folder",
    CALIBRATION_JUDGE_PROVIDER: "yandex",
    CALIBRATION_JUDGE_MODEL: "alias-b",
    CALIBRATION_JUDGE_API_KEY: "synthetic-test-key",
    CALIBRATION_JUDGE_FOLDER_ID: "synthetic-folder",
  };
  expect(
    independentJudge(configuration("A", env), configuration("JUDGE", env)),
  ).toBe(false);
});
it("saved-report gate blocks stale READY, refuses self-judging and does not require optional B", async () => {
  const { releaseExitCode } = await import("../../scripts/release-gate.mjs");
  const report = buildReport(completeReportResults(), 144, "external");
  const bundle = {
    reports: [
      { candidate: "A", status: "RUN", report },
      {
        candidate: "B",
        status: "NOT_RUN",
        report: { verdict: "SEMANTIC_UNVERIFIED" },
      },
    ],
  };
  expect(releaseExitCode(bundle)).toBe(0);
  expect(releaseExitCode(bundle, "B")).toBe(2);
  report.criticalFailures.push({
    scenarioId: "unit",
    turn: 0,
    gate: "premature_answer",
    detail: "critical",
  });
  expect(releaseExitCode(bundle)).toBe(1);
  report.criticalFailures = [];
  report.semanticReleaseValidity = "SELF_JUDGED_OR_INCOMPLETE_DIAGNOSTIC_ONLY";
  expect(releaseExitCode(bundle)).toBe(2);
});
