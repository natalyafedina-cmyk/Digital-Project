import {
  CORE_DIMENSIONS,
  type Dimension,
  type ScenarioResult,
  type CandidateConfig,
} from "./types";
import { CRITICAL_SEMANTIC_FLAGS } from "./judge";
export type MatrixRow = {
  metric: string;
  threshold: string;
  actual: number | null;
  status: "PASS" | "FAIL" | "UNVERIFIED";
  scenarioIds: string[];
};
export const THRESHOLDS = {
  critical_failures: 0,
  no_premature_answer: 100,
  lesson_continuity: 95,
  pedagogical_next_step: 95,
  child_clarity: 90,
  age_fit: 90,
  student_adaptation: 90,
  parent_rule_compliance: 95,
  english_beginner_support: 90,
  stt_integrity: 100,
  curriculum_integrity: 100,
  evidence_integrity: 100,
  internal_leakage: 100,
  task_duplication: 98,
  subject_semantic_min: 85,
  p50_seconds: 7,
  p95_seconds: 15,
};
export function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
function rate(pass: number, total: number) {
  return total ? (100 * pass) / total : null;
}
const clusterMap: Record<
  string,
  { name: string; layer: string; priority: string; direction: string }
> = {
  usable_response: {
    name: "UNUSABLE_RESPONSE",
    layer: "provider/route/fallback",
    priority: "P0",
    direction: "Investigate controlled multimodal failure handling",
  },
  no_premature_answer: {
    name: "PREMATURE_ANSWER",
    layer: "generation/response critic",
    priority: "P0",
    direction: "Consolidate answer-protection contracts",
  },
  curriculum_integrity: {
    name: "FABRICATED_CATALOG",
    layer: "request resolver",
    priority: "P0",
    direction: "Review bounded entity validation",
  },
  evidence_expected: {
    name: "MISSING_ATTEMPT_EVIDENCE",
    layer: "upstream task/analyzer",
    priority: "P2",
    direction: "Trace unavailable task context before evidence expectations",
  },
  evidence_integrity: {
    name: "EVIDENCE_INTEGRITY",
    layer: "analyzer/evidence",
    priority: "P0",
    direction: "Review attempt and evidence boundaries",
  },
  stt_integrity: {
    name: "STT_INTEGRITY",
    layer: "orchestration/evidence",
    priority: "P0",
    direction: "Review transcription uncertainty handling",
  },
  lesson_continuity: {
    name: "CONTEXT_LOSS",
    layer: "lesson state",
    priority: "P0",
    direction: "Consolidate target continuity",
  },
  fresh_task_present: {
    name: "MISSING_FRESH_TASK",
    layer: "planner/critic/fallback",
    priority: "P1",
    direction: "Review task acceptance versus fallback",
  },
  pedagogical_actions: {
    name: "NEXT_STEP_MISMATCH",
    layer: "planner/request resolver",
    priority: "P1",
    direction: "Consolidate transitions across subjects",
  },
  FALLBACK_OVERUSE: {
    name: "SAFE_RESPONSE_USAGE_DIAGNOSTIC",
    layer: "response critic policy/fallback",
    priority: "P3",
    direction:
      "Separate expected stage-zero self-check overrides from failure fallbacks; scripted rates are not Qwen quality",
  },
  support_transition: {
    name: "SUPPORT_STATE_DRIFT",
    layer: "resolver/planner/lesson state",
    priority: "P2",
    direction: "Review help-stage preservation on follow-ups",
  },
  method_switch: {
    name: "POOR_METHOD_SWITCH",
    layer: "planner/generation",
    priority: "P1",
    direction: "Verify representation changes",
  },
  internal_leakage: {
    name: "INTERNAL_IMPLEMENTATION_LEAKAGE",
    layer: "generation/presentation",
    priority: "P0",
    direction: "Consolidate presentation boundaries",
  },
  task_duplication: {
    name: "TASK_DUPLICATION",
    layer: "generation/output contract",
    priority: "P1",
    direction: "Review answer/task separation",
  },
  parent_rule_compliance: {
    name: "PARENT_RULE_SCOPE",
    layer: "parent rules/generation",
    priority: "P1",
    direction: "Review applicable rule execution",
  },
  clarification_loop: {
    name: "UNNECESSARY_CLARIFICATION",
    layer: "request resolver/lesson state",
    priority: "P0",
    direction: "Preserve original goals through clarification",
  },
};
export function buildReport(
  results: ScenarioResult[],
  planned: number,
  mode: "offline" | "external",
  configs: Array<
    Pick<CandidateConfig, "label" | "configured" | "model" | "provider">
  > = [],
) {
  const turns = results.flatMap((s) => s.turns),
    matrix: MatrixRow[] = [];
  const hardMetric = (metric: string, threshold: number) => {
    const applicable = results.filter((s) =>
        s.turns.some((t) => t.hard.some((h) => h.gate === metric)),
      ),
      failed = applicable.filter((s) =>
        s.turns.some((t) => t.hard.some((h) => h.gate === metric && !h.pass)),
      );
    const actual = rate(applicable.length - failed.length, applicable.length);
    matrix.push({
      metric,
      threshold: `>= ${threshold}%`,
      actual,
      status:
        actual === null ? "UNVERIFIED" : actual >= threshold ? "PASS" : "FAIL",
      scenarioIds: failed.map((s) => s.id),
    });
  };
  const criticalFailures = results.flatMap((s) =>
    s.turns.flatMap((t) =>
      t.hard
        .filter((h) => !h.pass && h.critical)
        .map((h) => ({
          scenarioId: s.id,
          turn: t.index,
          gate: h.gate,
          detail: h.detail,
        })),
    ),
  );
  const semanticCritical = results.flatMap((s) =>
    s.turns.flatMap((t) =>
      t.judge.flags
        .filter((f) => CRITICAL_SEMANTIC_FLAGS.includes(f))
        .map((gate) => ({
          scenarioId: s.id,
          turn: t.index,
          gate,
          detail: t.judge.briefReason,
        })),
    ),
  );
  criticalFailures.push(...semanticCritical);
  matrix.push({
    metric: "critical_failures",
    threshold: "0",
    actual: criticalFailures.length,
    status: criticalFailures.length ? "FAIL" : "PASS",
    scenarioIds: [...new Set(criticalFailures.map((f) => f.scenarioId))],
  });
  for (const key of [
    "no_premature_answer",
    "lesson_continuity",
    "parent_rule_compliance",
    "stt_integrity",
    "curriculum_integrity",
    "evidence_integrity",
    "internal_leakage",
    "task_duplication",
  ] as const)
    hardMetric(key, THRESHOLDS[key]);
  hardMetric("pedagogical_actions", 95);
  const semanticRates: Partial<Record<Dimension, number | null>> = {};
  for (const dimension of [
    ...CORE_DIMENSIONS,
    "english_beginner_support",
    "method_switch_quality",
    "humanities_reasoning",
    "visual_helpfulness",
  ] as Dimension[]) {
    const applicable = results.filter((s) =>
      s.turns.some(
        (t) =>
          t.semanticDimensions?.includes(dimension) ||
          t.judge.scores[dimension] !== undefined,
      ),
    );
    const complete = applicable.filter((s) =>
      s.turns
        .filter(
          (t) =>
            t.semanticDimensions?.includes(dimension) ||
            t.judge.scores[dimension] !== undefined,
        )
        .every(
          (t) =>
            t.httpStatus === 200 &&
            t.judge.status === "MEASURED" &&
            t.judge.scores[dimension] !== undefined,
        ),
    );
    const passed = complete.filter((s) =>
      s.turns
        .filter(
          (t) =>
            t.semanticDimensions?.includes(dimension) ||
            t.judge.scores[dimension] !== undefined,
        )
        .every(
          (t) =>
            t.httpStatus === 200 &&
            Number(t.judge.scores[dimension]) >= 3 &&
            !t.judge.flags.some((f) => CRITICAL_SEMANTIC_FLAGS.includes(f)),
        ),
    );
    semanticRates[dimension] = rate(passed.length, complete.length);
    if (dimension in THRESHOLDS) {
      const threshold = THRESHOLDS[dimension as keyof typeof THRESHOLDS];
      matrix.push({
        metric: dimension,
        threshold: `>= ${threshold}% (independent Judge)`,
        actual: semanticRates[dimension] ?? null,
        status:
          !complete.length || complete.length !== applicable.length
            ? "UNVERIFIED"
            : (semanticRates[dimension] || 0) >= threshold
              ? "PASS"
              : "FAIL",
        scenarioIds: applicable
          .filter((s) => !passed.includes(s))
          .map((s) => s.id),
      });
    }
  }
  const subjects = [
    "math",
    "russian",
    "english",
    "literature",
    "physics",
    "biology",
    "geography",
    "history",
    "informatics",
  ].map((subjectId) => {
    const group = results.filter((s) => s.subjectId === subjectId);
    const hardPass = group.filter((s) =>
      s.turns.every((t) => t.hard.every((h) => h.pass)),
    );
    const judged = group.filter((s) =>
      s.turns.every(
        (t) => t.httpStatus === 200 && t.judge.status === "MEASURED",
      ),
    );
    const semanticPass = judged.filter((s) =>
      s.turns.every(
        (t) =>
          Object.values(t.judge.scores).every((n) => Number(n) >= 3) &&
          !t.judge.flags.some((f) => CRITICAL_SEMANTIC_FLAGS.includes(f)),
      ),
    );
    return {
      subjectId,
      count: group.length,
      semanticCompleted: judged.length,
      semanticExpected: group.length,
      hardPassRate: rate(hardPass.length, group.length),
      semanticPassRate: judged.length
        ? rate(semanticPass.length, judged.length)
        : null,
    };
  });
  matrix.push({
    metric: "all_subject_coverage",
    threshold: "9 subjects",
    actual: subjects.filter((s) => s.count > 0).length,
    status:
      !results.length || results.length < planned
        ? "UNVERIFIED"
        : subjects.every((s) => s.count > 0)
          ? "PASS"
          : "FAIL",
    scenarioIds: [],
  });
  for (const subject of subjects)
    matrix.push({
      metric: `subject_semantic:${subject.subjectId}`,
      threshold: ">=85%",
      actual: subject.semanticPassRate,
      status:
        subject.semanticPassRate === null ||
        subject.semanticCompleted !== subject.semanticExpected
          ? "UNVERIFIED"
          : subject.semanticPassRate >= 85
            ? "PASS"
            : "FAIL",
      scenarioIds: results
        .filter(
          (s) =>
            s.subjectId === subject.subjectId &&
            s.turns.some(
              (t) =>
                t.judge.status === "MEASURED" &&
                Object.values(t.judge.scores).some((v) => Number(v) < 3),
            ),
        )
        .map((s) => s.id),
    });
  const normalTurns = turns.filter(
      (t) =>
        t.httpStatus === 200 &&
        !t.input.visionText &&
        !t.input.visionError &&
        t.input.sttConfidence == null,
    ),
    latencies = normalTurns.map((t) => t.latencyMs),
    calls = turns.map((t) => t.calls.length),
    generated = turns.filter((t) => (t.critic?.candidates.length || 0) > 0);
  const performance = {
    environmentSensitive: mode === "external",
    timingKind:
      mode === "offline"
        ? "MOCK_TIMING_NOT_USER_LATENCY"
        : "EXTERNAL_WALL_CLOCK_EXCLUDES_JUDGE",
    p50Ms: percentile(latencies, 0.5),
    p90Ms: percentile(latencies, 0.9),
    p95Ms: percentile(latencies, 0.95),
    maxMs: latencies.length ? Math.max(...latencies) : null,
    totalCalls: calls.reduce((a, b) => a + b, 0),
    callBreakdown: Object.fromEntries(
      ["resolver", "analyzer", "generator", "semantic_critic", "repair"].map(
        (kind) => [
          kind,
          turns.flatMap((t) => t.calls).filter((c) => c.kind === kind).length,
        ],
      ),
    ),
    nonAttemptAnalyzerCalls: turns
      .filter((t) => t.input.kind !== "attempt")
      .flatMap((t) => t.calls)
      .filter((c) => c.kind === "analyzer").length,
    pendingCallsAtSnapshot: turns
      .flatMap((t) => t.calls)
      .filter((c) => c.outcome === "pending").length,
    averageProviderMs: turns.length
      ? turns.reduce(
          (n, t) => n + t.calls.reduce((sum, c) => sum + c.latencyMs, 0),
          0,
        ) / turns.length
      : null,
    averageOrchestrationResidualMs: turns.length
      ? turns.reduce(
          (n, t) =>
            n +
            Math.max(
              0,
              t.latencyMs - t.calls.reduce((sum, c) => sum + c.latencyMs, 0),
            ),
          0,
        ) / turns.length
      : null,
    averageCallsPerTurn: calls.length
      ? calls.reduce((a, b) => a + b, 0) / calls.length
      : null,
    averageCallsPerScenario: results.length
      ? calls.reduce((a, b) => a + b, 0) / results.length
      : null,
    p50CallsPerScenario: percentile(
      results.map((s) => s.turns.reduce((n, t) => n + t.calls.length, 0)),
      0.5,
    ),
    maxCallsPerTurn: calls.length ? Math.max(...calls) : 0,
    maxCallsPerScenario: results.length
      ? Math.max(
          ...results.map((s) =>
            s.turns.reduce((n, t) => n + t.calls.length, 0),
          ),
        )
      : 0,
    firstPassRate: rate(
      generated.filter(
        (t) => !t.critic?.repairAttempted && !t.critic?.fallbackUsed,
      ).length,
      generated.length,
    ),
    repairRate: rate(
      generated.filter((t) => t.critic?.repairAttempted).length,
      generated.length,
    ),
    fallbackRate: rate(
      generated.filter((t) => t.critic?.fallbackUsed).length,
      generated.length,
    ),
    repairCount: generated.filter((t) => t.critic?.repairAttempted).length,
    fallbackCount: generated.filter((t) => t.critic?.fallbackUsed).length,
    policySelfCheckOverrides: generated.filter(
      (t) =>
        t.critic?.fallbackUsed &&
        t.before?.supportStage === 0 &&
        ["incorrect", "partial"].includes(t.input.correctness || ""),
    ).length,
    judgeLatencyMs: {
      p50: percentile(
        turns
          .filter((t) => t.judge.status !== "NOT_MEASURED")
          .map((t) => t.judge.latencyMs),
        0.5,
      ),
      p95: percentile(
        turns
          .filter((t) => t.judge.status !== "NOT_MEASURED")
          .map((t) => t.judge.latencyMs),
        0.95,
      ),
    },
    slowTurnIds: results
      .filter((s) => s.turns.some((t) => t.latencyMs > 25000))
      .map((s) => s.id),
  };
  for (const [key, value, threshold] of [
    ["p50_seconds", performance.p50Ms, 7],
    ["p95_seconds", performance.p95Ms, 15],
  ] as const)
    matrix.push({
      metric: key,
      threshold: `<=${threshold}s`,
      actual: mode === "external" && value !== null ? value / 1000 : null,
      status:
        mode === "offline" || value === null
          ? "UNVERIFIED"
          : value / 1000 <= threshold
            ? "PASS"
            : "FAIL",
      scenarioIds: performance.slowTurnIds,
    });
  const groups = new Map<
    string,
    {
      name: string;
      layer: string;
      priority: string;
      direction: string;
      scenarioIds: Set<string>;
      subjects: Set<string>;
      examples: Array<{ scenarioId: string; turn: number; response: string }>;
    }
  >();
  const add = (key: string, s: ScenarioResult, t: (typeof turns)[number]) => {
    const meta = clusterMap[key] || {
      name: key,
      layer:
        key === "CHILD_LANGUAGE_TOO_FORMAL"
          ? "generation prompt/model"
          : "unverified layer hypothesis",
      priority:
        key === "SLOW_PROVIDER" ||
        key === "EXCESS_MODEL_CALLS" ||
        key === "ANALYZER_FOR_NON_ATTEMPT_REQUEST"
          ? "P3"
          : "P1",
      direction: "Review representative evidence during Consolidation Sprint",
    };
    let g = groups.get(meta.name);
    if (!g) {
      g = {
        ...meta,
        scenarioIds: new Set(),
        subjects: new Set(),
        examples: [],
      };
      groups.set(meta.name, g);
    }
    g.scenarioIds.add(s.id);
    g.subjects.add(s.subjectId);
    if (g.examples.length < 3)
      g.examples.push({
        scenarioId: s.id,
        turn: t.index,
        response: String(t.response.answer || "").slice(0, 500),
      });
  };
  for (const s of results)
    for (const t of s.turns) {
      for (const h of t.hard.filter((h) => !h.pass)) add(h.gate, s, t);
      for (const f of t.judge.flags) add(f, s, t);
      if (t.critic?.fallbackUsed) add("FALLBACK_OVERUSE", s, t);
      if (t.calls.length > 3) add("EXCESS_MODEL_CALLS", s, t);
      if (
        t.input.kind !== "attempt" &&
        t.calls.some((c) => c.kind === "analyzer")
      )
        add("ANALYZER_FOR_NON_ATTEMPT_REQUEST", s, t);
      if (mode === "external" && t.latencyMs > 25000)
        add("SLOW_PROVIDER", s, t);
    }
  const clusters = [...groups.values()]
    .map((g) => ({
      ...g,
      count: g.scenarioIds.size,
      scenarioIds: [...g.scenarioIds],
      subjects: [...g.subjects],
    }))
    .sort((a, b) => a.priority.localeCompare(b.priority) || b.count - a.count);
  const independentValid =
      mode === "external" &&
      results.length === planned &&
      turns.every(
        (t) =>
          t.httpStatus === 200 &&
          t.judge.status === "MEASURED" &&
          t.judge.independent,
      ),
    complete =
      results.length === planned &&
      results.every((s) => s.status === "COMPLETED");
  const measuredFail = matrix.some((m) => m.status === "FAIL");
  const verdict = measuredFail
    ? "NOT_READY"
    : !results.length
      ? "SEMANTIC_UNVERIFIED"
      : mode === "external" && (!complete || planned < 120)
        ? "BENCHMARK_INCOMPLETE"
        : !independentValid
          ? "SEMANTIC_UNVERIFIED"
          : matrix.some((m) => m.status === "UNVERIFIED")
            ? "BENCHMARK_INCOMPLETE"
            : "READY";
  const severity = (s: ScenarioResult) =>
    s.turns.reduce(
      (n, t) =>
        n +
        t.hard.filter((h) => !h.pass).length * 5 +
        Object.values(t.judge.scores).filter((v) => Number(v) < 3).length,
      0,
    );
  const sample = [
    ...subjects.flatMap((sub) => {
      const group = results
        .filter((s) => s.subjectId === sub.subjectId)
        .sort((a, b) => severity(b) - severity(a));
      return group.length ? [group[0], group[group.length - 1]] : [];
    }),
    ...results.filter((s) => s.turns.some((t) => t.hard.some((h) => !h.pass))),
    ...results,
  ];
  const representative = [...new Map(sample.map((s) => [s.id, s])).values()]
    .slice(0, 20)
    .map((s) => { const observed=s.turns.find(t=>t.hard.some(h=>!h.pass))||s.turns.find(t=>t.judge.status==="MEASURED"&&Object.values(t.judge.scores).some(v=>Number(v)<3))||s.turns.at(-1);return ({
      id: s.id,
      subjectId: s.subjectId,
      classification: s.turns.some((t) => t.hard.some((h) => !h.pass))
        ? "HARD_FAILURE"
        : s.turns.some(
              (t) =>
                t.judge.status === "MEASURED" &&
                Object.values(t.judge.scores).some((v) => Number(v) < 3),
            )
          ? "SEMANTIC_FAILURE"
          : mode === "offline"
            ? "SCRIPTED_STRUCTURAL_ONLY"
            : "PASS_OR_BORDERLINE",
      observedTurn:observed?.index,
      input: observed?.input.user,
      answer: observed?.response.answer,
      taskBlock: observed?.response.taskBlock,
    });});
  return {
    schemaVersion: 1,
    baseline: "0c020714860a297dfcf68be92fbf9970d9ad41e4",
    mode,
    planned,
    totalScenarios: results.length,
    completedScenarios: results.filter((s) => s.status === "COMPLETED").length,
    configs,
    semanticReleaseValidity: independentValid
      ? "INDEPENDENT_JUDGE_VALID"
      : turns.some((t) => t.judge.status === "MEASURED")
        ? "SELF_JUDGED_OR_INCOMPLETE_DIAGNOSTIC_ONLY"
        : "UNVERIFIED",
    semanticRates,
    subjects: subjects.map((subject) => ({
      ...subject,
      topFailureCategory:
        clusters.find((c) => c.subjects.includes(subject.subjectId))?.name ||
        null,
    })),
    matrix,
    criticalFailures,
    clusters,
    topSystemicIssues: clusters.slice(0, 5),
    performance,
    representative,
    verdict,
    informational: [
      "Runtime help ladder 0–4 versus canonical protocol 0–6: informational, no automatic failure.",
      "Offline scripted responses measure structure, not model language quality.",
      "Fallback observation uses equality with current safeResponse fields; policy self-check overrides are included.",
      "Fake DB is not an RLS/SQL benchmark; existing local SQL tests remain separate.",
      "Counts are logical LLMProvider.generate calls; adapter-internal fallback HTTP requests are not separately observed.",
      "No infrastructure retries by default; semantic answers never retried outside runtime critic.",
    ],
    results,
  };
}
export type Report = ReturnType<typeof buildReport>;
export function markdown(r: Report) {
  const fmt = (v: number | null) =>
    v === null ? "NOT MEASURED" : v.toFixed(2);
  return `# SOFIA CALIBRATION BASELINE\n\nBaseline: ${r.baseline}\nMode: ${r.mode}\nScenarios: ${r.totalScenarios}/${r.planned}\nCompleted: ${r.completedScenarios}\nVerdict: **${r.verdict}**\nSemantic release validity: ${r.semanticReleaseValidity}\n\n## Release readiness matrix\n\n| Metric | Threshold | Actual | Status | Evidence |\n|---|---|---:|---|---|\n${r.matrix.map((m) => `| ${m.metric} | ${m.threshold} | ${fmt(m.actual)} | ${m.status} | ${m.scenarioIds.join(", ")} |`).join("\n")}\n\n## All subjects\n\n| Subject | Scenarios | Hard pass % | Semantic pass % |\n|---|---:|---:|---:|\n${r.subjects.map((s) => `| ${s.subjectId} | ${s.count} | ${fmt(s.hardPassRate)} | ${fmt(s.semanticPassRate)} |`).join("\n")}\n\n## Performance\n\nTiming: ${r.performance.timingKind}. p50=${fmt(r.performance.p50Ms)}ms; p90=${fmt(r.performance.p90Ms)}ms; p95=${fmt(r.performance.p95Ms)}ms; max=${fmt(r.performance.maxMs)}ms. Judge timing is separate.\nCalls: ${r.performance.totalCalls}; average/turn=${fmt(r.performance.averageCallsPerTurn)}; average/scenario=${fmt(r.performance.averageCallsPerScenario)}; max/turn=${r.performance.maxCallsPerTurn}; max/scenario=${r.performance.maxCallsPerScenario}.\nFirst-pass=${fmt(r.performance.firstPassRate)}%; repair=${fmt(r.performance.repairRate)}% (${r.performance.repairCount}); fallback=${fmt(r.performance.fallbackRate)}% (${r.performance.fallbackCount}).\n\n## Top systemic failure clusters (hypotheses, no fixes)\n\n${r.topSystemicIssues.map((c, i) => `${i + 1}. **${c.name}** — ${c.priority}, ${c.count} scenarios; subjects: ${c.subjects.join(", ")}. Likely layer: ${c.layer}. Direction: ${c.direction}.\n   IDs: ${c.scenarioIds.join(", ")}.\n   Example: ${c.examples[0]?.response || "(unusable response)"}`).join("\n\n")}\n\n## Representative review sample\n\n${r.representative.map((s) => `### ${s.id} (${s.classification})\n\nInput: ${s.input}\n\nResponse: ${s.answer || "(no usable response)"}\n\nTask: ${JSON.stringify(s.taskBlock || null)}`).join("\n\n")}\n\n## Measurement boundaries\n\n${r.informational.map((v) => "- " + v).join("\n")}\n`;
}
