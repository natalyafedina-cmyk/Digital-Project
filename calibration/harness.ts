import { storage, type RunContext } from "./context";
import { MemoryDB } from "./memory-db";
import {
  configuration,
  independentJudge,
  instrument,
  scriptedProvider,
} from "./providers";
import { hardEvaluate } from "./evaluate";
import { judgeTurn, relevantDimensions } from "./judge";
import type {
  Scenario,
  ScenarioResult,
  TurnResult,
  CandidateConfig,
  CriticTrace,
} from "./types";
import type { LLMProvider } from "@/lib/providers/types";
import type { LessonState } from "@/lib/pedagogy/types";
export async function runScenario(
  s: Scenario,
  label: "OFFLINE" | "A" | "B",
  post: (r: Request) => Promise<Response>,
  factory: (e: Record<string, string | undefined>) => LLMProvider,
  options: {
    candidate?: CandidateConfig;
    judge?: CandidateConfig;
    timeoutMs?: number;
  } = {},
): Promise<ScenarioResult> {
  const db = new MemoryDB(s),
    results: TurnResult[] = [],
    history: Array<{ role: string; text: string }> = [];
  const run: RunContext = {
    scenario: s,
    turn: s.turns[0],
    db,
    provider: { generate: async () => "" },
    calls: [],
    critic: null,
    criticContext: null,
  };
  const baseProvider =
    label === "OFFLINE"
      ? scriptedProvider(
          s,
          () => run.turn,
          () => run.criticContext,
        )
      : factory((options.candidate || configuration(label)).env);
  const judgeConfig = options.judge,
    judgeProvider = judgeConfig?.configured ? factory(judgeConfig.env) : null;
  const candidateBudget=options.timeoutMs||60000;
  let candidateSpent=0;
  const provider = instrument(
    {
      generate: (request, signal) => {
        if (run.cancelled) return Promise.reject(Error("SCENARIO_CANCELLED"));
        return baseProvider.generate(request, signal);
      },
    },
    run.calls,
  );
  run.provider = provider;
  return storage.run(run, async () => {
    for (const [index, input] of s.turns.entries()) {
      run.turn = input;
      run.critic = null;
      run.criticContext = null;
      const callStart = run.calls.length,
        evidenceStart = db.evidenceRows.length;
      if (input.statusOverride) {
        const state = db.tables.student_skill_state.find(
          (r) => r.skill_id === s.skillId,
        );
        if (state) state.status = input.statusOverride;
      }
      const before = structuredClone(
        db.session.lesson_state,
      ) as LessonState | null;
      const knownSkill=input.skillId||before?.target.skillId||s.skillId;
      const known=db.tables.student_skill_state.find(row=>row.skill_id===knownSkill);
      const studentState={status:String(known?.status||'not_seen'),independentSuccesses:Number(known?.independent_successes||0),hintedSuccesses:Number(known?.hinted_successes||0),failures:Number(known?.failures||0)};
      const started = performance.now();
      const deadline=started+Math.max(1,candidateBudget-candidateSpent);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let response: Record<string, unknown> = {},
        httpStatus = 0,
        errorCode: string | undefined;
      try {
        const request = new Request("http://calibration.local/api/tutor", {
          method: "POST",
          body: JSON.stringify({
            childId: "synthetic-child",
            sessionId: "synthetic-session",
            subject: s.subjectId,
            courseId: s.courseId || undefined,
            mode: "practice",
            message: input.user,
            history,
            turnId: `synthetic-${s.id}-${index}`,
            supportStage: 4,
            inputModality:
              input.sttConfidence != null
                ? "voice"
                : input.visionText || input.visionError
                  ? "image"
                  : s.modality,
            sttConfidence: input.sttConfidence,
            imageDataUrl:
              input.visionText || input.visionError
                ? "data:image/png;base64,c3ludGhldGlj"
                : undefined,
          }),
        });
        const res = await Promise.race([
          post(request),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => {
                run.cancelled = true;
                reject(Error("SCENARIO_TIMEOUT"));
              },
              Math.max(1, deadline - performance.now()),
            );
          }),
        ]);
        httpStatus = res.status;
        response = await res.json();
      } catch {
        errorCode = "TIMEOUT_OR_TRANSPORT";
      } finally {
        clearTimeout(timer);
      }
      const latencyMs = performance.now() - started;
      candidateSpent+=latencyMs;
      const after = structuredClone(
        db.session.lesson_state,
      ) as LessonState | null;
      const observed = run.critic as CriticTrace | null;
      const t: TurnResult = {
        index,
        studentState,
        input,
        httpStatus,
        response,
        before,
        after,
        evidence: structuredClone(db.evidenceRows.slice(evidenceStart)),
        calls: run.calls.slice(callStart).map((call) => ({
          ...call,
          latencyMs:
            call.outcome === "pending"
              ? performance.now() - (call.startedAtMs || performance.now())
              : call.latencyMs,
        })),
        latencyMs,
        critic: observed
          ? {
              candidates: observed.candidates,
              flags: observed.flags,
              repairAttempted: observed.repairAttempted,
              fallbackUsed: observed.fallbackUsed,
              fallbackObservation: observed.fallbackObservation,
            }
          : null,
        hard: [],
        judge: {
          status: "NOT_MEASURED",
          scores: {},
          flags: [],
          briefReason: "External Judge not run",
          independent: false,
          latencyMs: 0,
        },
      };
      t.semanticDimensions = relevantDimensions(s, t);
      t.hard = hardEvaluate(s, t);
      if (errorCode)
        t.hard.push({
          gate: "timeout",
          pass: false,
          critical: true,
          detail: errorCode,
        });
      if (label !== "OFFLINE" && judgeProvider && httpStatus === 200 && candidateSpent<candidateBudget)
        t.judge = await judgeTurn(
          judgeProvider,
          s,
          t,
          independentJudge(
            options.candidate || configuration(label),
            judgeConfig!,
          ),
          20000,
        );
      if (candidateSpent >= candidateBudget && !errorCode) {
        run.cancelled = true;
        errorCode = "SCENARIO_TIMEOUT";
        t.hard.push({
          gate: "timeout",
          pass: false,
          critical: true,
          detail: errorCode,
        });
      }
      results.push(t);
      history.push(
        { role: "user", text: input.user },
        {
          role: "assistant",
          text:
            String(response.answer || "") +
            (response.taskBlock
              ? "\n" + String((response.taskBlock as { prompt: string }).prompt)
              : ""),
        },
      );
      if (errorCode) break;
    }
    return {
      id: s.id,
      subjectId: s.subjectId,
      category: s.category,
      candidate: label,
      status: results.some((t) =>
        t.hard.some((h) => h.gate === "timeout" && !h.pass),
      )
        ? "TIMEOUT"
        : results.some((t) => t.httpStatus !== 200)
          ? "ERROR"
          : "COMPLETED",
      turns: results,
      latencyMs: results.reduce((sum, t) => sum + t.latencyMs, 0),
    };
  });
}
export async function pool<T, R>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<R>,
) {
  const result: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      async () => {
        while (cursor < items.length) {
          const i = cursor++;
          result[i] = await run(items[i]);
        }
      },
    ),
  );
  return result;
}
