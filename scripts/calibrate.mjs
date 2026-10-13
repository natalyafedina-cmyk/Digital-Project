import { releaseExitCode } from "./release-gate.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const args = process.argv.slice(2),
  mode = args.includes("--external") ? "external" : "offline";
function value(flag, fallback) {
  const i = args.indexOf(flag);
  return i < 0 ? fallback : args[i + 1];
}
const output = value("--output", "artifacts/calibration");
if (args.includes("--report") || args.includes("--gate")) {
  const report = JSON.parse(
    readFileSync(`${output}/sprint5-baseline.json`, "utf8"),
  );
  console.log(
    JSON.stringify(
      report.reports.map((r) => ({
        candidate: r.candidate,
        status: r.status,
        verdict: r.report.verdict,
        criticalFailures: r.report.criticalFailures.length,
      })),
      null,
      2,
    ),
  );
  if (args.includes("--gate"))
    process.exit(releaseExitCode(report, value("--candidate")));
  process.exit(0);
}
if (mode === "external" && process.env.RUN_CALIBRATION_EXTERNAL !== "1") {
  console.error(
    "External calls disabled. Set RUN_CALIBRATION_EXTERNAL=1 explicitly.",
  );
  process.exit(2);
}
const options = {
  mode,
  output,
  smoke: args.includes("--smoke"),
  subject: value("--subject"),
  category: value("--category"),
  id: value("--id"),
  candidate: value("--candidate", "A"),
  judge: !args.includes("--no-judge"),
  repeats: Number(value("--repeats", "1")),
  concurrency: Number(value("--concurrency", "2")),
};
if (
  !Number.isInteger(options.repeats) ||
  options.repeats < 1 ||
  !Number.isInteger(options.concurrency) ||
  options.concurrency < 1
) {
  console.error("Invalid repeat/concurrency value");
  process.exit(2);
}
const r = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "tests/calibration/run.test.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CALIBRATION_RUN: "1",
      CALIBRATION_OPTIONS: JSON.stringify(options),
    },
  },
);
process.exit(r.status ?? 1);
