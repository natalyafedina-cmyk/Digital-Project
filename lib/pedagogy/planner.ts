import type { Resolution } from "@/lib/learning-request/types";
import type { TurnAnalysis } from "@/lib/learning-analysis";
import type { ParentRule } from "@/lib/parent-rule-engine";
import { METHOD_LABELS, type TeachingMethod } from "@/lib/adaptive-learning";
import type { LessonState, Decision, Action } from "./types";
export function planPedagogy(input: {
  request: Resolution;
  state: LessonState;
  analysis: TurnAnalysis;
  skillStatus?: string;
  rules: ParentRule[];
  sttConfidence?: number | null;
}): Decision {
  const { request: r, state: s, analysis: a } = input;
  const changed =
    r.turnKind === "new_goal" &&
    (r.skillId !== s.target.skillId ||
      r.courseId !== s.target.courseId ||
      r.curriculumUnitId !== s.target.curriculumUnitId);
  const target = {
    subjectId: r.subjectId,
    courseId: r.courseId,
    curriculumUnitId: r.curriculumUnitId,
    skillId: r.skillId,
  };
  let stage: LessonState["supportStage"] = changed ? 0 : s.supportStage;
  let actions: Action[] = [],
    phase: Decision["nextPhase"] = "await_attempt",
    expected: Decision["expectedLearnerAction"] = "attempt_task";
  const reasonCodes: string[] = changed ? ["new_target"] : [];
  let method: TeachingMethod = Object.hasOwn(
    METHOD_LABELS,
    s.previousMethod || "",
  )
    ? (s.previousMethod as TeachingMethod)
    : "dialogue";
  let resumeTarget: Decision["resumeTarget"] = changed ? null : undefined;
  if (input.sttConfidence != null && input.sttConfidence < 0.65) {
    Object.assign(target, s.target);
    stage = s.supportStage;
    actions = ["confirm_transcript"];
    phase = s.phase;
    expected = "confirm_transcript";
    reasonCodes.push("low_stt_confidence");
  } else if (r.needsClarification || !r.courseId) {
    actions = ["clarify_target"];
    phase = "clarify";
    expected = "clarify";
    reasonCodes.push("target_ambiguous");
  } else if (r.requestedActions.includes("change_method")) {
    actions = ["change_representation"];
    phase = s.phase;
    expected = s.expectedLearnerAction;
    method =
      (Object.keys(METHOD_LABELS) as TeachingMethod[]).find(
        (m) => m !== s.previousMethod && !s.failedMethods.includes(m),
      ) || "dialogue";
    reasonCodes.push("method_failed");
  } else if (
    a.learningEvidenceEligible &&
    a.errorClasses.includes("prerequisite_gap") &&
    a.prerequisiteSkillIds[0]
  ) {
    resumeTarget = {...target};
    target.skillId = a.prerequisiteSkillIds[0];
    target.curriculumUnitId = null;
    stage = 0;
    actions = ["review_prerequisite", "give_practice_task"];
    reasonCodes.push("prerequisite_gap");
  } else if (a.learningEvidenceEligible && a.correctness === "correct") {
    if (s.resumeTarget) {
      Object.assign(target, s.resumeTarget);
      resumeTarget = null;
      actions = ["give_practice_task"];
      reasonCodes.push("return_to_goal");
    } else {
      actions = [
        input.skillStatus === "mastered"
          ? "give_transfer_task"
          : "verify_independence",
      ];
      reasonCodes.push(
        stage > 0 ? "hinted_success_verify" : "independent_verification_needed",
      );
    }
    stage = 0;
    phase = "verify_independence";
  } else if (r.requestedActions.includes("ask_for_hint")) {
    stage = Math.min(4, stage + 1) as LessonState["supportStage"];
    actions = [
      (
        [
          "ask_for_attempt",
          "give_small_hint",
          "give_concrete_hint",
          "solve_one_step_together",
          "give_full_explanation",
        ] as Action[]
      )[stage],
    ];
    phase = "retry";
    expected = "retry";
    reasonCodes.push("hint_requested");
  } else if (
    a.learningEvidenceEligible &&
    ["incorrect", "partial"].includes(a.correctness)
  ) {
    actions = [
      stage === 0
        ? "ask_for_attempt"
        : (
            [
              "ask_for_attempt",
              "give_small_hint",
              "give_concrete_hint",
              "solve_one_step_together",
              "give_full_explanation",
            ] as Action[]
          )[stage],
    ];
    phase = "retry";
    expected = "retry";
    reasonCodes.push("reliable_error_self_check");
  } else if (r.turnKind === "learner_attempt") {
    actions = ["ask_for_attempt"];
    phase = s.phase;
    expected = s.expectedLearnerAction;
    reasonCodes.push("uncertain_attempt");
  } else {
    for (const action of r.requestedActions) {
      if (action === "explain") actions.push("explain_concept");
      else if (
        ["practice", "verify_understanding", "exam_prep"].includes(action)
      )
        actions.push(
          input.skillStatus === "mastered" ||
            input.skillStatus === "nearly_mastered"
            ? "give_transfer_task"
            : input.skillStatus === "needs_review"
              ? "ask_diagnostic_question"
              : "give_practice_task",
        );
      else if (action === "visualize") actions.push("change_representation");
      else if (action === "short_answer") actions.push("summarize");
      else actions.push("ask_for_attempt");
    }
    if (!actions.length) actions = ["ask_for_attempt"];
    if (actions.length===1&&actions[0]==="summarize"){phase="complete";expected="none";}
    if (actions.includes("explain_concept") && actions.length === 1) {
      phase = "explain";
      expected = "answer";
    }
    reasonCodes.push("request_sequence");
  }
  const fresh = actions.some((x) =>
    [
      "give_practice_task",
      "give_transfer_task",
      "verify_independence",
      "ask_diagnostic_question",
    ].includes(x),
  );
  if (fresh) stage = 0;
  const interactionOnly = actions.some((a) =>
    ["clarify_target", "confirm_transcript"].includes(a),
  );
  let visual = interactionOnly ? false : r.explicitConstraints.wantsVisual;
  for (const rule of interactionOnly ? [] : input.rules) {
    const c = rule.structured_rule?.constraints;
    if (
      c?.format === "visual" &&
      ["require", "prefer"].includes(rule.structured_rule?.effect || "")
    )
      visual = true;
    if (
      c?.method &&
      Object.hasOwn(METHOD_LABELS, c.method) &&
      ["require", "prefer"].includes(rule.structured_rule?.effect || "") &&
      !actions.includes("change_representation")
    ) {
      method = c.method as TeachingMethod;
      break;
    }
  }
  return {
    actions: actions.slice(0, 2),
    target,
    nextPhase: phase,
    supportStage: stage,
    teachingMethod: method,
    expectedLearnerAction: expected,
    shouldGenerateTask: fresh,
    responseConstraints: {
      doNotRevealSolution:
        r.explicitConstraints.doNotRevealSolution || stage < 4,
      requireFreshTask: fresh,
      requireVisual: visual,
      maxExplanationDepth: stage === 4 ? "detailed" : "brief",
    },
    reasonCodes,
    resumeTarget,
  };
}
