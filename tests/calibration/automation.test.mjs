import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compare } from "../../scripts/compare-calibration.mjs";
import { smokeInfrastructure } from "../../scripts/calibration-preflight.mjs";
function bundle(mode = "external", score = 90, critical = 0) {
  return {
    reports: [
      {
        candidate: mode === "offline" ? "OFFLINE" : "A",
        status: "RUN",
        report: {
          mode,
          verdict: critical ? "NOT_READY" : "READY",
          completedScenarios: 1,
          configs: [
            { label: "A", model: "qwen", configured: true },
            { label: "JUDGE", model: "gpt", configured: true },
          ],
          criticalFailures: Array(critical).fill({}),
          matrix: [{ metric: "child_clarity", actual: score, status: "PASS" }],
          performance: {
            p50Ms: 1000,
            p95Ms: 2000,
            averageCallsPerTurn: 2,
            repairRate: 1,
            fallbackRate: 2,
          },
          results: [
            {
              id: "one",
              turns: [
                {
                  judge: { status: "MEASURED" },
                  calls: [{ outcome: "ok" }],
                  hard: [],
                  httpStatus: 200,
                },
              ],
            },
          ],
        },
      },
    ],
  };
}
describe("calibration automation", () => {
  it("computes percentage point deltas and lower-is-better metrics", () => {
    const r = compare(bundle("external", 80, 1), bundle("external", 90));
    assert.equal(r.rows.find((x) => x.metric === "child_clarity").delta, 10);
    assert.equal(
      r.rows.find((x) => x.metric === "critical_failures").status,
      "IMPROVEMENT",
    );
  });
  it("does not manufacture offline to external deltas", () =>
    assert.equal(
      compare(bundle("offline"), bundle()).rows.every((x) => x.delta === null),
      true,
    ));
  it("preserves hard failure despite prose improvement", () => {
    const r = compare(bundle("external", 80), bundle("external", 90, 1));
    assert.equal(r.comparison, "REGRESSION");
    assert.equal(r.verdict, "NOT_READY");
  });
  it("does not compare different scenario sets or missing baselines", () => {
    const a = bundle();
    a.reports[0].report.results[0].id = "other";
    assert.equal(compare(a, bundle()).comparison, "NOT_COMPARABLE");
    assert.equal(
      compare(null, bundle()).rows.every((x) => x.delta === null),
      true,
    );
  });
  it("permits pedagogical NOT_READY smoke with healthy infrastructure", () =>
    assert.equal(smokeInfrastructure(bundle("external", 60, 1)), true));
  it("stops missing, self-judged, unauthenticated, invalid judge and timeout smoke", () => {
    assert.equal(smokeInfrastructure({ reports: [] }), false);
    for (const mutation of [
      (r) => (r.configs[1].model = "qwen"),
      (r) => (r.completedScenarios = 0),
      (r) => (r.results[0].turns[0].httpStatus = 401),
      (r) => (r.results[0].turns[0].judge.status = "JUDGE_ERROR"),
      (r) => (r.results[0].turns[0].hard = [{ gate: "timeout", pass: false }]),
      (r) => (r.results[0].turns[0].calls[0].outcome = "error"),
    ]) {
      const b = bundle();
      mutation(b.reports[0].report);
      assert.equal(smokeInfrastructure(b), false);
    }
  });
});
