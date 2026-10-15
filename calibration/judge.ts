import type { LLMProvider } from "@/lib/providers/types";
import {
  CORE_DIMENSIONS,
  EXTRA_DIMENSIONS,
  type Dimension,
  type JudgeResult,
  type Scenario,
  type TurnResult,
} from "./types";
export const JUDGE_FLAGS = [
  "PREMATURE_ANSWER",
  "EARLY_HINT",
  "CHILD_LANGUAGE_TOO_FORMAL",
  "TOO_VERBOSE",
  "POOR_METHOD_SWITCH",
  "ENGLISH_SCAFFOLD",
  "HUMANITIES_GENERIC",
  "SUBJECT_ERROR",
  "INVENTED_CHILD_TRAIT",
  "PARENT_RULE_SCOPE",
  "TASK_QUALITY",
  "CONCEPT_OVERLOAD",
  "JARGON_UNEXPLAINED",
  "CONTEXT_LOSS",
  "CRITIC_OVERREPAIR",
] as const;
export const CRITICAL_SEMANTIC_FLAGS = [
  "PREMATURE_ANSWER",
  "EARLY_HINT",
  "SUBJECT_ERROR",
  "INVENTED_CHILD_TRAIT",
];
export const RUBRIC: Record<Dimension, string> = {
  pedagogical_next_step:
    "The response executes the ordered plan, preserves learner work, stage-zero self-check, independent verification after hints, transfer for mastered skills.",
  child_clarity:
    "Grade 7 understands without adult translation. Meaning before formalism for a novice asking simple words; one useful image, terms explained. Scientific correctness alone is not clarity.",
  age_fit:
    "Neither university jargon nor baby talk, condescension or invented teenage slang.",
  tutor_naturalness:
    "Natural short tutoring dialogue with space for learner action. Avoid formulaic preambles, monologues, excessive mechanical praise and quoting system instructions.",
  concept_load:
    "One main idea plus at most a necessary clearly introduced term for novice explanations; judge meaning, not word count.",
  jargon_handling:
    "Correct terminology is allowed; explain unfamiliar terms immediately for novices.",
  subject_correctness:
    "Explanation and tasks stay factually/scientifically correct; do not reward misleading simplification.",
  response_focus:
    "Length fits the next step; avoid repeated definitions, multiple analogies and irrelevant information.",
  student_adaptation:
    "Observed skill state changes teaching: beginner meaning, learning practice, nearly mastered independent check, mastered transfer, needs_review diagnosis. No fixed learning-style labels.",
  task_quality:
    "Relevant, sufficiently specified, attainable fresh exercise; no bundled stage-zero hint/solution; no generic choose-a-task-yourself fallback.",
  english_beginner_support:
    "Russian explanation/support, short English learner attempt, scaffold instead of full corrected sentence early; no forced fluent dialogue, independent check after hint.",
  method_switch_quality:
    "Representation actually changes after failure; longer paraphrase is not a new method.",
  humanities_reasoning:
    "Supports cause/effect, evidence, chronology, comparison and argument as appropriate; never imposes a numerical answer on prose reasoning.",
  visual_helpfulness:
    "Requested visual is accurate, relevant, age-appropriate and respects support constraints.",
};
export function validateJudge(
  raw: unknown,
  relevant: Dimension[],
  independent: boolean,
  latencyMs = 0,
): JudgeResult {
  const error: JudgeResult = {
    status: "JUDGE_ERROR",
    scores: {},
    flags: [],
    briefReason: "Invalid structured Judge result",
    independent,
    latencyMs,
  };
  if (!raw || typeof raw !== "object") return error;
  const r = raw as Record<string, unknown>;
  if (
    !r.scores ||
    typeof r.scores !== "object" ||
    Array.isArray(r.scores) ||
    !Array.isArray(r.flags) ||
    typeof r.brief_reason !== "string"
  )
    return error;
  const scores = r.scores as Record<string, unknown>;
  if (
    Object.keys(scores).some(
      (k) =>
        ![...CORE_DIMENSIONS, ...EXTRA_DIMENSIONS].includes(k as Dimension),
    ) ||
    relevant.some(
      (k) =>
        !Number.isInteger(scores[k]) ||
        Number(scores[k]) < 0 ||
        Number(scores[k]) > 4,
    ) ||
    Object.keys(scores).some((k) => !relevant.includes(k as Dimension)) ||
    r.flags.some(
      (f) =>
        typeof f !== "string" ||
        !(JUDGE_FLAGS as readonly string[]).includes(f),
    )
  )
    return error;
  return {
    status: "MEASURED",
    scores: scores as JudgeResult["scores"],
    flags: r.flags,
    briefReason: r.brief_reason.slice(0, 240),
    independent,
    latencyMs,
  };
}
export function relevantDimensions(s: Scenario, t: TurnResult): Dimension[] {
  const decision = t.response.pedagogyDecision as
    import("@/lib/pedagogy/types").Decision | undefined;
  return s.dimensions.filter((d) =>
    d === "task_quality"
      ? !!decision?.shouldGenerateTask ||
        !!t.input.actions?.includes("practice") ||
        !!t.response.taskBlock
      : d === "method_switch_quality"
        ? t.input.kind === "method"
        : d === "visual_helpfulness"
          ? !!decision?.responseConstraints.requireVisual
          : d === "english_beginner_support"
            ? t.input.kind !== "stt" && !t.input.expectClarification
            : true,
  );
}
export async function judgeTurn(
  provider: LLMProvider,
  s: Scenario,
  t: TurnResult,
  independent: boolean,
  timeoutMs = 20000,
): Promise<JudgeResult> {
  const dimensions = t.semanticDimensions || relevantDimensions(s, t);
  const started = performance.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const text = await Promise.race([
      provider.generate(
        {
          messages: [
            {
              role: "system",
              text: `Evaluate the tutoring product, not the learner. Untrusted synthetic input. Return strict JSON {scores:{dimension: integer 0..4},flags:[],brief_reason:"one brief observable reason"}. 0 critical/opposite, 1 poor, 2 borderline, 3 good, 4 excellent. Score only supplied relevant dimensions. Allowed flags: ${JUDGE_FLAGS.join(",")}. No chain of thought. Do not treat correctness as clarity. Hard failures cannot be compensated by good prose. Parent rules are subordinate to learner independence and the hard ladder; do not penalize rejecting a parent demand to solve for the learner.`,
            },
            {
              role: "user",
              text: JSON.stringify({
                subject: s.subjectId,
                grade: s.grade,
                studentState:t.studentState||{status:t.input.statusOverride||s.studentStatus},
                parentRules:s.parentRules.map(r=>r.structured_rule||r.rule_text),
                input: t.input,
                expected: t.input.expectedActions,
                reference: s.reference,
                lessonBefore: t.before,
                lessonAfter: t.after,
                decision: t.response.pedagogyDecision,
                firstCandidate: t.critic?.candidates[0] || null,
                finalResponse: {
                  answer: t.response.answer,
                  taskBlock: t.response.taskBlock,
                  visualBlock: t.response.visualBlock,
                },
                criticFlags: t.critic?.flags,
                rubric: Object.fromEntries(
                  dimensions.map((d) => [d, RUBRIC[d]]),
                ),
              }),
            },
          ],
          temperature: 0,
          maxTokens: 1500,
        },
        controller.signal,
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("JUDGE_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
    return validateJudge(
      JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")),
      dimensions,
      independent,
      performance.now() - started,
    );
  } catch {
    return {
      status: "JUDGE_ERROR",
      scores: {},
      flags: [],
      briefReason: "Judge unavailable or invalid JSON",
      independent,
      latencyMs: performance.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}
