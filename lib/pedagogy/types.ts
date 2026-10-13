import type { TeachingMethod } from "@/lib/adaptive-learning";
import type { Target } from "@/lib/learning-request/types";
export const PHASES = [
  "orient",
  "explain",
  "await_attempt",
  "support",
  "retry",
  "verify_independence",
  "clarify",
  "complete",
] as const;
export type LessonPhase = (typeof PHASES)[number];
export type TaskBlock = { prompt: string; skillId: string | null };
export type LessonState = {
  version: 1;
  target: Target;
  phase: LessonPhase;
  objective: string | null;
  supportStage: 0 | 1 | 2 | 3 | 4;
  expectedLearnerAction:
    | "none"
    | "answer"
    | "attempt_task"
    | "retry"
    | "confirm_transcript"
    | "clarify";
  lastTask: { text: string; skillId: string | null } | null;
  previousMethod: string | null;
  failedMethods: string[];
  pendingIndependentVerification: boolean;
  resumeTargetSkillId: string | null;
  resumeTarget?: Target | null;
  pendingClarification?: {
    originalRequestText: string;
  } | null;
};
export type Action =
  | "clarify_target"
  | "explain_concept"
  | "ask_diagnostic_question"
  | "give_practice_task"
  | "ask_for_attempt"
  | "give_small_hint"
  | "give_concrete_hint"
  | "solve_one_step_together"
  | "give_full_explanation"
  | "change_representation"
  | "review_prerequisite"
  | "verify_independence"
  | "give_transfer_task"
  | "summarize"
  | "confirm_transcript";
export type Decision = {
  actions: Action[];
  target: Target;
  nextPhase: LessonPhase;
  supportStage: LessonState["supportStage"];
  teachingMethod: TeachingMethod;
  expectedLearnerAction: LessonState["expectedLearnerAction"];
  shouldGenerateTask: boolean;
  responseConstraints: {
    doNotRevealSolution: boolean;
    requireFreshTask: boolean;
    requireVisual: boolean;
    maxExplanationDepth: "brief" | "normal" | "detailed";
  };
  reasonCodes: string[];
  resumeTarget?: Target | null;
};
