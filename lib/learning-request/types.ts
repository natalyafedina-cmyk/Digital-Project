import type { Course, Skill } from "@/lib/curriculum/types";
export const REQUESTED_ACTIONS = [
  "explain",
  "practice",
  "solve_with_support",
  "check_homework",
  "visualize",
  "memorize",
  "exam_prep",
  "short_answer",
  "ask_for_hint",
  "change_method",
  "verify_understanding",
] as const;
export type RequestedAction = (typeof REQUESTED_ACTIONS)[number];
export type Target = {
  subjectId: string;
  courseId: string | null;
  curriculumUnitId: string | null;
  skillId: string | null;
};
export type Unit = { id: string; title: string; course_id: string };
export type Resolution = Target & {
  turnKind:
    | "new_goal"
    | "follow_up"
    | "learner_attempt"
    | "help_request"
    | "conversation_management"
    | "clarification"
    | "unknown";
  requestedActions: RequestedAction[];
  confidence: number;
  explicitConstraints: {
    doNotRevealSolution: boolean;
    wantsFreshTask: boolean;
    wantsVisual: boolean;
    concise: boolean | null;
  };
  needsClarification: boolean;
  clarificationQuestion: string | null;
};
export type RequestCatalog = {
  courses: readonly Course[];
  units: Unit[];
  skills: Skill[];
};
