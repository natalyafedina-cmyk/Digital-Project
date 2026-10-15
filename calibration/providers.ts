import type { LLMProvider, LLMRequest } from "@/lib/providers/types";
import type {
  CandidateConfig,
  CallKind,
  CallTrace,
  Scenario,
  TurnSpec,
} from "./types";
import type { CriticContext } from "@/lib/response-critic";
export function configuration(
  label: "A" | "B" | "JUDGE",
  env: Record<string, string | undefined> = process.env,
): CandidateConfig {
  const prefix = label === "A" ? "LLM" : `CALIBRATION_${label}`;
  const mapped: Record<string, string | undefined> =
    label === "A"
      ? { ...env }
      : {
          LLM_PROVIDER: env[`${prefix}_PROVIDER`],
          LLM_BASE_URL: env[`${prefix}_BASE_URL`],
          LLM_API_KEY: env[`${prefix}_API_KEY`],
          LLM_MODEL: env[`${prefix}_MODEL`],
          YANDEX_API_KEY: env[`${prefix}_API_KEY`],
          YANDEX_FOLDER_ID: env[`${prefix}_FOLDER_ID`],
        };
  const provider = mapped.LLM_PROVIDER || "yandex",
    configured =
      provider === "openai-compatible"
        ? !!(mapped.LLM_BASE_URL && mapped.LLM_API_KEY && mapped.LLM_MODEL)
        : provider === "yandex" &&
          !!(mapped.YANDEX_API_KEY && mapped.YANDEX_FOLDER_ID);
  return {
    label,
    configured,
    provider: configured ? provider : null,
    model: configured
      ? provider === "yandex"
        ? "yandexgpt/latest"
        : mapped.LLM_MODEL || null
      : null,
    env: mapped,
  };
}
export function independentJudge(
  candidate: CandidateConfig,
  judge: CandidateConfig,
) {
  return (
    candidate.configured && judge.configured && candidate.model !== judge.model
  );
}
export function classifyCall(r: LLMRequest): CallKind {
  const system = r.messages.find((m) => m.role === "system")?.text || "";
  return system.startsWith("Resolve the learning request")
    ? "resolver"
    : system.startsWith("Analyze a learner turn")
      ? "analyzer"
      : system.startsWith("Critique the AI response")
        ? "semantic_critic"
        : /Repair these response violations/.test(system)
          ? "repair"
          : "generator";
}
export function instrument(
  provider: LLMProvider,
  trace: CallTrace[],
  now = () => performance.now(),
): LLMProvider {
  return {
    async generate(request, signal) {
      const started = now(),
        kind = classifyCall(request);
      const record: CallTrace = {
        kind,
        latencyMs: 0,
        outcome: "pending",
        startedAtMs: started,
      };
      trace.push(record);
      try {
        const result = await provider.generate(request, signal);
        record.latencyMs = now() - started;
        record.outcome = "ok";
        return result;
      } catch {
        record.latencyMs = now() - started;
        record.outcome = "error";
        throw new Error("CANDIDATE_PROVIDER_ERROR");
      }
    },
  };
}
export function scriptedProvider(
  s: Scenario,
  getTurn: () => TurnSpec,
  getContext: () => CriticContext | null,
  getLastTask?: () => string | null,
): LLMProvider {
  let taskNumber = 0;
  return {
    async generate(request) {
      const kind = classifyCall(request),
        t = getTurn(),
        skillId = t.skillId || s.skillId,
        courseId =
          t.courseId ||
          s.lessonState?.target.courseId ||
          s.courseId ||
          s.targetCourseId;
      if (kind === "resolver") {
        return JSON.stringify({
          turnKind:
            t.kind === "attempt"
              ? "learner_attempt"
              : t.kind === "resume"
                ? "follow_up"
                : "new_goal",
          requestedActions: t.actions || ["explain"],
          courseId:
            t.invalidId === "course"
              ? "fabricated.course"
              : t.expectClarification
                ? null
                : courseId,
          curriculumUnitId: t.invalidId === "unit" ? "fabricated.unit" : null,
          skillId:
            t.invalidId === "skill"
              ? "fabricated.skill"
              : t.expectClarification
                ? null
                : skillId,
          confidence: t.expectClarification && !t.invalidId ? 0.3 : 0.95,
          explicitConstraints: {
            doNotRevealSolution: true,
            wantsFreshTask: t.actions?.includes("practice") || false,
            wantsVisual: t.kind === "resume",
            concise: true,
          },
          needsClarification: t.expectClarification === true,
        });
      }
      if (kind === "analyzer") {
        const input = JSON.parse(request.messages.at(-1)?.text || "{}") as {
          previousTask?: string;
        };
        if (
          !input.previousTask ||
          (!(getLastTask?.() || getContext()?.lastTask) &&
            !input.previousTask.includes(s.reference.task))
        )
          return JSON.stringify({
            attemptKind: "unknown",
            correctness: "unknown",
            confidence: 0,
            skillIds: [],
            prerequisiteSkillIds: [],
            errorClasses: [],
            evidenceSummary: null,
          });
        return JSON.stringify({
          attemptKind: "answer",
          correctness: t.correctness || "unknown",
          confidence: 0.95,
          skillIds: [skillId],
          prerequisiteSkillIds: t.prerequisiteSkillId
            ? [t.prerequisiteSkillId]
            : [],
          errorClasses: t.prerequisiteSkillId
            ? ["prerequisite_gap"]
            : t.correctness === "incorrect"
              ? s.subjectId === "english"
                ? ["grammar_form"]
                : ["reasoning_gap"]
              : t.correctness === "partial"
                ? ["incomplete_answer"]
                : [],
          evidenceSummary: "Synthetic observable response to the current task",
        });
      }
      if (kind === "semantic_critic") return JSON.stringify({ flags: [] });
      const c = getContext(),
        d = c?.decision;
      taskNumber++;
      const fresh = d?.shouldGenerateTask;
      const task = fresh
        ? t.fixtureTask ||
          (taskNumber === 1
            ? s.reference.task
            : `Новое задание: ${s.reference.task} Предложи другой способ проверки (${taskNumber}).`)
        : null;
      const answer = d?.actions.includes("explain_concept")
        ? `Разберём смысл темы «${s.reference.topic}» на одном понятном примере. Теперь можно попробовать самостоятельно.`
        : d?.actions.includes("change_representation")
          ? "Рассмотрим эту же идею с другой стороны и сравним две ситуации."
          : d?.actions.includes("ask_for_attempt")
            ? "Проверь один шаг своего рассуждения."
            : fresh
              ? "Попробуй новое задание самостоятельно."
              : "Подумай, какое правило поможет выбрать следующий шаг.";
      return JSON.stringify({
        answer:
          answer +
          (s.subjectId === "english" ? " Затем ответь по-английски." : ""),
        taskBlock: task ? { prompt: task, skillId } : null,
        visualBlock: c?.wantsVisual ? "Условие → ___ → вывод" : null,
        teachingMethod: d?.teachingMethod || "dialogue",
        hintLevel: d?.supportStage || 0,
        correctness: "unknown",
      });
    },
  };
}
