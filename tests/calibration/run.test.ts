import { metadata } from "../../calibration/metadata";
import "./setup";
import { realProviders } from "./setup";
import { expect, it } from "vitest";
import { POST } from "@/app/api/tutor/route";
import { scenarios } from "../../calibration/scenarios";
import { runScenario, pool } from "../../calibration/harness";
import { buildReport, markdown } from "../../calibration/report";
import { configuration } from "../../calibration/providers";
import { archive } from "../../calibration/archive";
import { mkdirSync, writeFileSync } from "node:fs";
const explicit = process.env.CALIBRATION_RUN === "1";
const options = JSON.parse(process.env.CALIBRATION_OPTIONS || "{}") as {
  mode?: "offline" | "external";
  smoke?: boolean;
  subject?: string;
  category?: string;
  id?: string;
  candidate?: string;
  judge?: boolean;
  repeats?: number;
  concurrency?: number;
  output?: string;
};
if (!explicit) {
  for (const s of scenarios)
    it(`calibration structural harness: ${s.id}`, async () => {
      const result = await runScenario(
        s,
        "OFFLINE",
        POST,
        realProviders.createLLMProvider,
      );
      expect(result.turns.length).toBe(s.turns.length);
      expect(result.turns.every((t) => t.hard.length > 0)).toBe(true);
      expect(result.turns.every((t) => t.judge.status === "NOT_MEASURED")).toBe(
        true,
      );
    });
} else
  it(
    "records reproducible full-Tutor calibration, without making baseline failures invisible",
    async () => {
      let selected = scenarios.filter(
        (s) =>
          (!options.subject || s.subjectId === options.subject) &&
          (!options.category || s.category === options.category) &&
          (!options.id || s.id === options.id),
      );
      if (options.smoke) {
        const subjects = new Set<string>(),
          first = selected.filter((s) => {
            if (subjects.has(s.subjectId)) return false;
            subjects.add(s.subjectId);
            return true;
          });
        selected = [
          ...new Map(
            [
              ...first,
              ...selected.filter((s) =>
                [
                  "hinted_flow",
                  "parent_rules",
                  "clarification",
                  "catalog_integrity",
                  "resume_visual",
                ].includes(s.category),
              ),
            ].map((s) => [s.id, s]),
          ).values(),
        ].slice(0, 18);
      }
      if (!selected.length) throw Error("No matching scenarios");
      const mode = options.mode || "offline",
        configs = ["A", "B", "JUDGE"].map((label) =>
          configuration(label as "A" | "B" | "JUDGE"),
        );
      const labels =
        mode === "offline"
          ? ["OFFLINE"]
          : String(options.candidate || "A").split(",");
      const reports = [];
      for (const label of labels) {
        if (!["OFFLINE", "A", "B"].includes(label))
          throw Error("Invalid candidate");
        const config = configs.find((c) => c.label === label);
        if (label !== "OFFLINE" && !config?.configured) {
          reports.push({
            candidate: label,
            status: label === "A" ? "SKIPPED_NO_CREDENTIALS" : "NOT_RUN",
            report: buildReport(
              [],
              selected.length,
              "external",
              configs.map(({ label, configured, model, provider }) => ({
                label,
                configured,
                model,
                provider,
              })),
            ),
          });
          continue;
        }
        const repeats = Math.max(1, Math.min(5, options.repeats || 1));
        if (repeats > 1 && selected.length > 20)
          throw Error(
            "Repeated paid runs require a selected subset <=20 scenarios",
          );
        const work = Array.from({ length: repeats }, () => selected).flat();
        const results = await pool(
          work,
          mode === "offline"
            ? 1
            : Math.max(1, Math.min(4, options.concurrency || 2)),
          (s) =>
            runScenario(
              s,
              label as "OFFLINE" | "A" | "B",
              POST,
              realProviders.createLLMProvider,
              {
                candidate: config,
                judge:
                  options.judge === false
                    ? undefined
                    : configs.find((c) => c.label === "JUDGE"),
              },
            ),
        );
        reports.push({
          candidate: label,
          status: "RUN",
          report: buildReport(
            results,
            work.length,
            mode,
            configs.map(({ label, configured, model, provider }) => ({
              label,
              configured,
              model,
              provider,
            })),
          ),
        });
      }
      const output = options.output || "artifacts/calibration";
      mkdirSync(output, { recursive: true });
      const comparison = reports.filter(
        (r) => r.status === "RUN" && ["A", "B"].includes(r.candidate),
      );
      const ab =
        comparison.length === 2
          ? {
              status: "MEASURED",
              sameScenarioIds:
                JSON.stringify(
                  comparison[0].report.results.map((r) => r.id),
                ) ===
                JSON.stringify(comparison[1].report.results.map((r) => r.id)),
              A: {
                semantic: comparison[0].report.semanticRates,
                hardFailures: comparison[0].report.criticalFailures.length,
                performance: comparison[0].report.performance,
              },
              B: {
                semantic: comparison[1].report.semanticRates,
                hardFailures: comparison[1].report.criticalFailures.length,
                performance: comparison[1].report.performance,
              },
              recommendation:
                "Review category trade-offs; no automatic model switch",
            }
          : { status: "NOT_RUN", recommendation: "Candidate B not measured" };
      const { evaluatedCommit, runtimeFingerprint } = metadata();
      writeFileSync(
        `${output}/sprint5-baseline.json`,
        JSON.stringify(
          {
            schemaVersion: 1,
            evaluatedCommit,
            runtimeFingerprint,
            scenariosTotal: scenarios.length,
            selected: selected.length,
            reports: reports.map((r) => ({ ...r, report: archive(r.report) })),
            comparison: ab,
          },
          null,
          0,
        ) + "\n",
      );
      writeFileSync(
        `${output}/sprint5-baseline.md`,
        reports
          .map(
            (r) =>
              `Candidate: ${r.candidate}; external status: ${r.status}\n\n${markdown(r.report)}`,
          )
          .join("\n\n---\n\n") +
          `\n\nA/B comparison: ${ab.status}. ${ab.recommendation}\n`,
      );
      console.log(
        JSON.stringify(
          reports.map((r) => ({
            candidate: r.candidate,
            status: r.status,
            scenarios: r.report.totalScenarios,
            verdict: r.report.verdict,
            criticalFailures: r.report.criticalFailures.length,
          })),
        ),
      );
    },
    Math.max(120000, scenarios.length * 120000),
  );
