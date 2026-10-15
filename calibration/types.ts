import type { Resolution } from "@/lib/learning-request/types";
import type { LessonState, Decision } from "@/lib/pedagogy/types";
import type { ParentRule } from "@/lib/parent-rule-engine";
import type { Candidate, CriticContext } from "@/lib/response-critic";
export const CORE_DIMENSIONS = [
  "pedagogical_next_step",
  "child_clarity",
  "age_fit",
  "tutor_naturalness",
  "concept_load",
  "jargon_handling",
  "subject_correctness",
  "response_focus",
  "student_adaptation",
  "task_quality",
] as const;
export const EXTRA_DIMENSIONS = [
  "english_beginner_support",
  "method_switch_quality",
  "humanities_reasoning",
  "visual_helpfulness",
] as const;
export type Dimension =
  (typeof CORE_DIMENSIONS)[number] | (typeof EXTRA_DIMENSIONS)[number];
export type TurnSpec = {
  user: string;
  kind:
    | "goal"
    | "attempt"
    | "hint"
    | "method"
    | "clarify"
    | "resume"
    | "new_topic"
    | "stt";
  correctness?: "correct" | "incorrect" | "partial";
  skillId?: string;
  courseId?: string;
  actions?: Resolution["requestedActions"];
  expectedActions?: Decision["actions"];
  expectedStage?: number;
  expectedPhase?: string;
  evidence?: boolean;
  sttConfidence?: number;
  visionText?: string;
  visionError?: boolean;
  statusOverride?: string;
  prerequisiteSkillId?: string;
  expectedTargetSkillId?: string;
  expectedResumeSkillId?: string | null;
  fixtureTask?: string;
  invalidId?: "course" | "unit" | "skill";
  expectClarification?: boolean;
};
export type Scenario = {
  id: string;
  category: string;
  subjectId: string;
  courseId: string | null;
  targetCourseId: string;
  skillId: string | null;
  grade: 7;
  studentStatus: string;
  lessonState: LessonState | null;
  parentRules: ParentRule[];
  modality: "text" | "voice" | "image";
  turns: TurnSpec[];
  dimensions: Dimension[];
  reference: {
    topic: string;
    task: string;
    correctAttempt: string;
    incorrectAttempt: string;
    partialAttempt: string;
    noRevealTokens: string[];
  };
  critical: boolean;
};
export type CallKind =
  | "resolver"
  | "analyzer"
  | "generator"
  | "semantic_critic"
  | "repair"
  | "judge";
export type CallTrace = {
  kind: CallKind;
  latencyMs: number;
  outcome: "ok" | "error" | "pending";
  startedAtMs?: number;
};
export type CriticTrace = {
  candidates: Candidate[];
  flags: string[];
  repairAttempted: boolean;
  fallbackUsed: boolean;
  fallbackObservation: "safe_response_field_equality";
  context: CriticContext;
};
export type HardFinding = {
  gate: string;
  pass: boolean;
  critical: boolean;
  detail: string;
};
export type JudgeResult = {
  status: "MEASURED" | "JUDGE_ERROR" | "NOT_MEASURED";
  scores: Partial<Record<Dimension, number>>;
  flags: string[];
  briefReason: string;
  independent: boolean;
  latencyMs: number;
};
export type TurnResult = {
  index: number;
  semanticDimensions?: Dimension[];
  studentState?: {status:string;independentSuccesses:number;hintedSuccesses:number;failures:number};
  input: TurnSpec;
  httpStatus: number;
  response: Record<string, unknown>;
  before: LessonState | null;
  after: LessonState | null;
  evidence: Record<string, unknown>[];
  calls: CallTrace[];
  latencyMs: number;
  critic: Omit<CriticTrace, "context"> | null;
  hard: HardFinding[];
  judge: JudgeResult;
};
export type ScenarioResult = {
  id: string;
  subjectId: string;
  category: string;
  candidate: "OFFLINE" | "A" | "B";
  status: "COMPLETED" | "TIMEOUT" | "ERROR";
  turns: TurnResult[];
  latencyMs: number;
  errorCode?: string;
};
export type CandidateConfig = {
  label: "A" | "B" | "JUDGE";
  configured: boolean;
  provider: string | null;
  model: string | null;
  env: Record<string, string | undefined>;
};
