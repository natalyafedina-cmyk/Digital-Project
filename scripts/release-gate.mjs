// Gate saved measured facts, not just a possibly stale verdict string. B is optional.
export function releaseExitCode(bundle, candidate) {
  const reports = bundle?.reports;
  if (!Array.isArray(reports) || !reports.length) return 2;
  const label =
    candidate ||
    (reports.some((r) => r.candidate === "A")
      ? "A"
      : reports.some((r) => r.candidate === "OFFLINE")
        ? "OFFLINE"
        : "B");
  const selected = reports.filter((r) =>
    label.split(",").includes(r.candidate),
  );
  if (!selected.length) return 2;
  if (
    selected.some(
      (r) =>
        r.report?.criticalFailures?.length > 0 ||
        r.report?.matrix?.some((m) => m.status === "FAIL") ||
        r.report?.verdict === "NOT_READY",
    )
  )
    return 1;
  const ready = selected.every(
    (r) =>
      r.status === "RUN" &&
      r.report?.verdict === "READY" &&
      r.report?.mode === "external" &&
      r.report?.semanticReleaseValidity === "INDEPENDENT_JUDGE_VALID" &&
      r.report?.totalScenarios >= 120 &&
      r.report?.completedScenarios === r.report?.planned &&
      r.report?.totalScenarios === r.report?.planned &&
      Array.isArray(r.report?.matrix) &&
      r.report.matrix.length > 0 &&
      r.report.matrix.every((m) => m.status === "PASS"),
  );
  return ready ? 0 : 2;
}
