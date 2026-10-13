import {
  PHASES,
  type LessonState,
  type Decision,
  type TaskBlock,
} from "./types";
import type { Target } from "@/lib/learning-request/types";
export function initialState(target: Target): LessonState {
  return {
    version: 1,
    target,
    phase: "orient",
    objective: null,
    supportStage: 0,
    expectedLearnerAction: "none",
    lastTask: null,
    previousMethod: null,
    failedMethods: [],
    pendingIndependentVerification: false,
    resumeTargetSkillId: null,
    resumeTarget: null,
    pendingClarification: null,
  };
}
export function readState(raw: unknown, target: Target): LessonState {
  if (!raw || typeof raw !== "object") return initialState(target);
  const r = raw as LessonState;
  if (
    r.version !== 1 ||
    !r.target ||
    r.target.subjectId !== target.subjectId ||
    !PHASES.includes(r.phase) ||
    ![0, 1, 2, 3, 4].includes(r.supportStage) ||
    ![
      "none",
      "answer",
      "attempt_task",
      "retry",
      "confirm_transcript",
      "clarify",
    ].includes(r.expectedLearnerAction)
  )
    return initialState(target);
  return {
    ...initialState(target),
    phase:r.phase,
    supportStage:r.supportStage,
    expectedLearnerAction:r.expectedLearnerAction,
    objective:typeof r.objective==='string'?r.objective.slice(0,200):null,
    previousMethod:typeof r.previousMethod==='string'?r.previousMethod.slice(0,60):null,
    pendingIndependentVerification:r.pendingIndependentVerification===true,
    resumeTarget:r.resumeTarget && r.resumeTarget.subjectId===target.subjectId ? {subjectId:target.subjectId,courseId:r.resumeTarget.courseId,curriculumUnitId:r.resumeTarget.curriculumUnitId,skillId:r.resumeTarget.skillId}:null,
    resumeTargetSkillId:typeof r.resumeTargetSkillId==='string'?r.resumeTargetSkillId:null,
    pendingClarification:
      r.pendingClarification &&
      typeof r.pendingClarification.originalRequestText === "string"
        ? { originalRequestText: r.pendingClarification.originalRequestText.slice(0, 3000) }
        : null,
    lastTask:
      r.lastTask && typeof r.lastTask.text === "string"
        ? { text: r.lastTask.text.slice(0, 1500), skillId: r.lastTask.skillId }
        : null,
    failedMethods: Array.isArray(r.failedMethods)
      ? r.failedMethods.filter((s) => typeof s === "string").map(s=>s.slice(0,60)).slice(-4)
      : [],
  };
}
export function acceptedState(
  state: LessonState,
  d: Decision,
  task: TaskBlock | null,
): LessonState {
  const changed =
    state.target.skillId !== d.target.skillId ||
    state.target.courseId !== d.target.courseId ||
    state.target.curriculumUnitId !== d.target.curriculumUnitId;
  return {
    ...state,
    target: d.target,
    phase: d.nextPhase,
    supportStage: d.supportStage,
    expectedLearnerAction: d.expectedLearnerAction,
    lastTask: task
      ? { text: task.prompt.slice(0, 1500), skillId: d.target.skillId }
      : changed
        ? null
        : state.lastTask,
    previousMethod: d.teachingMethod,
    failedMethods:
      d.actions.includes("change_representation") && state.previousMethod
        ? [...state.failedMethods, state.previousMethod].slice(-4)
        : state.failedMethods,
    pendingIndependentVerification: d.nextPhase === "verify_independence",
    resumeTarget:
      d.resumeTarget === undefined ? state.resumeTarget : d.resumeTarget,
    resumeTargetSkillId:
      (d.resumeTarget === undefined ? state.resumeTarget : d.resumeTarget)
        ?.skillId || null,
  };
}
