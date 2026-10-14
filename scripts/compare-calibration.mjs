import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export function metrics(r) {
  const m = Object.fromEntries(
    (r.matrix || []).map((x) => [x.metric, x.actual]),
  );
  const p = r.performance || {};
  return {
    ...m,
    critical_failures: r.criticalFailures?.length ?? null,
    p50_seconds: r.mode === "external" && Number.isFinite(p.p50Ms) ? p.p50Ms / 1000 : null,
    p95_seconds: r.mode === "external" && Number.isFinite(p.p95Ms) ? p.p95Ms / 1000 : null,
    average_calls_per_turn: p.averageCallsPerTurn ?? null,
    repair_rate: p.repairRate ?? null,
    fallback_rate: p.fallbackRate ?? null,
  };
}
const tracked = [
  "critical_failures",
  "no_premature_answer",
  "lesson_continuity",
  "pedagogical_actions",
  "child_clarity",
  "age_fit",
  "tutor_naturalness",
  "student_adaptation",
  "english_beginner_support",
  "p50_seconds",
  "p95_seconds",
  "average_calls_per_turn",
  "repair_rate",
  "fallback_rate",
];
const lower = new Set([
  "critical_failures",
  "p50_seconds",
  "p95_seconds",
  "average_calls_per_turn",
  "repair_rate",
  "fallback_rate",
]);
export function compare(previous, current, candidate = "A") {
  const now =
    current.reports.find((x) => x.candidate === candidate) ||
    current.reports[0];
  const old =
    previous?.reports?.find((x) => x.candidate === now.candidate) ||
    previous?.reports?.find((x) => x.candidate === "OFFLINE");
  const a = old ? metrics(old.report) : {},
    b = metrics(now.report);
  const comparable =
    old?.report.mode === now.report.mode &&
    JSON.stringify(old.report.results?.map((x) => x.id).sort()) ===
      JSON.stringify(now.report.results?.map((x) => x.id).sort());
  const rows = tracked.map((metric) => {
    const before = a[metric] ?? null,
      after = b[metric] ?? null;
    const delta =
      comparable && Number.isFinite(before) && Number.isFinite(after)
        ? after - before
        : null;
    return {
      metric,
      before,
      after,
      delta,
      status:
        delta === null
          ? "NOT_COMPARABLE"
          : delta === 0
            ? "PASS"
            : delta * (lower.has(metric) ? -1 : 1) > 0
              ? "IMPROVEMENT"
              : "REGRESSION",
    };
  });
  const hardRegression =
    comparable &&
    now.report.matrix.some(
      (x) =>
        x.status === "FAIL" &&
        old.report.matrix.some(
          (y) => y.metric === x.metric && y.status === "PASS",
        ),
    );
  return {
    candidate: now.candidate,
    verdict: now.report.verdict,
    comparison:
      hardRegression || rows.some((x) => x.status === "REGRESSION")
        ? "REGRESSION"
        : comparable
          ? "COMPARABLE"
          : "NOT_COMPARABLE",
    rows,
  };
}
export function summary(bundle) {
  return bundle.reports
    .map((x) => {
      const r = x.report;
      return `Commit: ${bundle.evaluatedCommit}\n\nCandidate: ${x.candidate}; Judge: ${r.configs?.find((c) => c.label === "JUDGE")?.model || "UNCONFIGURED"}; ${r.semanticReleaseValidity}\n\nScenarios: ${r.totalScenarios}/${r.planned}; completed: ${r.completedScenarios}; verdict: ${r.verdict}\n\n| Metric | Value |\n|---|---|\n${Object.entries(
        metrics(r),
      )
        .filter(([k]) => tracked.includes(k))
        .map(
          ([k, v]) => `| ${k} | ${Number.isFinite(v) ? v : "NOT_MEASURED"} |`,
        )
        .join("\n")}\n`;
    })
    .join("\n");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [previous, current, prefix, candidate = "A"] = process.argv.slice(2);
  const bundle = JSON.parse(readFileSync(current, "utf8"));
  const result = compare(
    previous === "-" ? null : JSON.parse(readFileSync(previous, "utf8")),
    bundle,
    candidate,
  );
  const md =
    summary(bundle) +
    `\nComparison: ${result.comparison}\n\n| Metric | Before | After | Delta | Status |\n|---|---|---|---|---|\n` +
    result.rows
      .map(
        (r) =>
          `| ${r.metric} | ${r.before ?? "NOT_MEASURED"} | ${r.after ?? "NOT_MEASURED"} | ${r.delta ?? "N/A"} | ${r.status} |`,
      )
      .join("\n") +
    "\n";
  writeFileSync(prefix + ".json", JSON.stringify(result, null, 2) + "\n");
  writeFileSync(prefix + ".md", md);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}
