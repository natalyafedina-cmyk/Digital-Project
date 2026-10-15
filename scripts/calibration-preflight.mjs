import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export function smokeInfrastructure(bundle) {
  const a = bundle.reports?.find((x) => x.candidate === "A");
  if (!a || a.status !== "RUN" || a.report.mode !== "external") return false;
  const r = a.report,
    configs = r.configs || [],
    candidate = configs.find((x) => x.label === "A"),
    judge = configs.find((x) => x.label === "JUDGE");
  if (
    !candidate?.configured ||
    !judge?.configured ||
    candidate.model === judge.model ||
    !r.completedScenarios
  )
    return false;
  const turns = (r.results || []).flatMap((x) => x.turns || []);
  const judged = turns.filter((x) => x.judge?.status === "MEASURED").length;
  const badJudge = turns.filter(
    (x) => x.judge?.status === "JUDGE_ERROR",
  ).length;
  const calls = turns.flatMap((x) => x.calls || []);
  const failed = calls.filter((x) => x.outcome !== "ok").length;
  const timeouts = turns.filter((x) =>
    (x.hard || []).some((h) => h.gate === "timeout" && !h.pass),
  ).length;
  // Conservative infrastructure cutoff: >=20% errors. Pedagogical failures do not stop full.
  return (
    turns.length > 0 &&
    judged > 0 &&
    badJudge / turns.length < 0.2 &&
    failed / Math.max(1, calls.length) < 0.2 &&
    timeouts / turns.length < 0.2 &&
    !turns.some((x) => [401, 403].includes(x.httpStatus))
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const ok = smokeInfrastructure(
    JSON.parse(readFileSync(process.argv[2], "utf8")),
  );
  console.log(ok ? "SMOKE_INFRASTRUCTURE_PASS" : "SMOKE_INFRASTRUCTURE_STOP");
  process.exit(ok ? 0 : 2);
}
