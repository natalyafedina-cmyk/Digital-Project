import catalog from "@/lib/curriculum/catalog-data.json";
import { COURSES } from "@/lib/curriculum/catalog";
import type { Scenario, TurnResult, HardFinding } from "./types";
import type { Decision, TaskBlock } from "@/lib/pedagogy/types";
export function hardEvaluate(s: Scenario, t: TurnResult): HardFinding[] {
  const result: HardFinding[] = [];
  const check = (gate: string, pass: boolean, critical = true, detail = "") =>
    result.push({ gate, pass, critical, detail });
  const r = t.response,
    d = r.pedagogyDecision as Decision | undefined,
    task = r.taskBlock as TaskBlock | undefined,
    after = t.after,
    text = [r.answer, task?.prompt, r.visualBlock]
      .filter((v) => typeof v === "string")
      .join("\n");
  check(
    "usable_response",
    t.httpStatus === 200 &&
      typeof r.answer === "string" &&
      (r.answer.length > 0 || !!task?.prompt),
    true,
    `HTTP ${t.httpStatus}`,
  );
  if (t.httpStatus !== 200) return result;
  const validCourse =
    after?.target.courseId == null ||
    COURSES.some(
      (c) => c.id === after.target.courseId && c.subjectId === s.subjectId,
    );
  const validSkill =
    after?.target.skillId == null ||
    catalog.skills.some(
      (k) =>
        k.id === after.target.skillId &&
        k.subject_id === s.subjectId &&
        (!k.course_id || k.course_id === after.target.courseId),
    );
  const validUnit =
    after?.target.curriculumUnitId == null ||
    catalog.curriculum_units.some(
      (u) =>
        u.id === after.target.curriculumUnitId &&
        u.course_id === after.target.courseId &&
        u.grade === s.grade,
    );
  check("curriculum_integrity", validCourse && validSkill && validUnit);
  check(
    "internal_leakage",
    ![
      ...COURSES.map((c) => c.id),
      ...catalog.skills.map((k) => k.id),
      ...catalog.curriculum_units.map((u) => u.id),
    ].some((id) => text.includes(id)) &&
      !/(?:support\s*stage|supportStage|teachingMethod|criticFlags|expectedLearnerAction|curriculumUnitId|nextSupportStage|worked_example|step_by_step|oral_practice|cause_effect|map_logic|character_analysis|reasonCodes?|skill_id|course_id|critic\s*flags|confidence\s*[:=]|уровень\s+помощи|уровень\s*[:—]?\s*[0-4]|PedagogyDecision|LearnerTurnAnalyzer|visual_schema|retrieval_practice)/i.test(
        text,
      ),
  );
  const normalize = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  check(
    "task_duplication",
    !task?.prompt ||
      !normalize(String(r.answer)).includes(normalize(task.prompt)),
    false,
  );
  const answerAndVisual = [r.answer, r.visualBlock]
    .filter((v) => typeof v === "string")
    .join("\n");
  const leakTokens = s.reference.noRevealTokens;
  const doNot = d?.responseConstraints.doNotRevealSolution !== false;
  const knownCorrect=t.input.correctness==="correct"&&r.correctness==="correct";
  check(
    "no_premature_answer",
    !doNot || knownCorrect ||
      (!leakTokens.some((token) =>
        normalize(answerAndVisual).includes(normalize(token)),
      ) &&
        !/(?:готовый\s+ответ|правильный\s+ответ|solution|final\s+answer)\s*[:=]/i.test(
          text,
        )),
  );
  if (task && d?.supportStage === 0)
    check(
      "stage_zero_task",
      !/(?:подсказка\s*[:—]|первый\s+шаг\s*[:—]|сначала\s+(?:вычти|прибавь|умножь|раздели)|solution\s*[:=]|ответ\s*[:=])/i.test(
        task.prompt,
      ),
    );
  if (t.input.expectedActions)
    check(
      "pedagogical_actions",
      JSON.stringify(d?.actions) === JSON.stringify(t.input.expectedActions),
      false,
      `expected ${t.input.expectedActions.join(",")}; actual ${d?.actions.join(",")}`,
    );
  if (t.input.expectedStage !== undefined)
    check(
      "support_transition",
      after?.supportStage === t.input.expectedStage,
      true,
      `expected ${t.input.expectedStage}; actual ${after?.supportStage}`,
    );
  if (t.input.expectedPhase)
    check("lesson_continuity", after?.phase === t.input.expectedPhase);
  if (d?.shouldGenerateTask || t.input.actions?.includes("practice"))
    check(
      "fresh_task_present",
      !!task?.prompt && task.prompt !== t.before?.lastTask?.text,
      false,
    );
  check(
    "evidence_integrity",
    t.evidence.every(
      (e) =>
        ["attempt"].includes(t.input.kind) &&
        !!t.input.correctness &&
        Number(e.p_analyzer_confidence) >= 0.7 &&
        (e.p_stt_confidence == null || Number(e.p_stt_confidence) >= 0.65) &&
        catalog.skills.some(
          (k) => k.id === e.p_skill_id && k.subject_id === s.subjectId,
        ),
    ),
    true,
  );
  if (t.input.evidence !== undefined)
    check(
      t.input.evidence ? "evidence_expected" : "evidence_integrity",
      t.input.evidence ? t.evidence.length > 0 : t.evidence.length === 0,
      !t.input.evidence,
      `expected evidence=${t.input.evidence}; writes=${t.evidence.length}`,
    );
  if (t.input.kind === "stt") {
    check(
      "stt_integrity",
      t.evidence.length === 0 &&
        after?.supportStage === t.before?.supportStage &&
        after?.target.skillId === t.before?.target.skillId &&
        after?.expectedLearnerAction === "confirm_transcript",
    );
  }
  if (t.input.expectedTargetSkillId)
    check(
      "lesson_continuity",
      after?.target.skillId === t.input.expectedTargetSkillId,
    );
  if (t.input.expectedResumeSkillId !== undefined)
    check(
      "lesson_continuity",
      after?.resumeTargetSkillId === t.input.expectedResumeSkillId,
    );
  if (
    ["attempt", "hint", "method", "resume"].includes(t.input.kind) &&
    t.before?.target.skillId &&
    !t.input.prerequisiteSkillId &&
    !t.input.expectedTargetSkillId
  ) {
    check(
      "lesson_continuity",
      after?.target.skillId === t.before.target.skillId &&
        after?.target.courseId === t.before.target.courseId,
    );
  }
  if (t.input.kind === "new_topic")
    check(
      "new_topic_reset",
      after?.target.skillId === t.input.skillId &&
        after?.supportStage === 0 &&
        after.lastTask?.text !== t.before?.lastTask?.text,
    );
  if (t.input.expectClarification)
    check(
      "clarification",
      after?.phase === "clarify" && task == null && t.evidence.length === 0,
    );
  if (
    t.input.kind === "clarify" &&
    !t.input.expectClarification &&
    t.input.courseId
  )
    check(
      "clarification_loop",
      after?.target.courseId === t.input.courseId && after?.phase !== "clarify",
    );
  if (t.input.kind === "method")
    check(
      "method_switch",
      after?.previousMethod !== t.before?.previousMethod,
      false,
    );
  for(const rule of s.parentRules){const structured=rule.structured_rule,c=structured?.constraints;if(!structured||!c||structured.effect!=='require'||structured.subjectId&&structured.subjectId!==s.subjectId||structured.courseId&&structured.courseId!==s.targetCourseId||structured.skillId&&structured.skillId!==(t.input.skillId||s.skillId))continue;
    let compliant=true;
    if(c.maxSentences)compliant=compliant&&String(r.answer).split(/[.!?]+/).filter(v=>v.trim()).length<=c.maxSentences;
    if(c.language==='ru')compliant=compliant&&/[а-яё]/i.test(String(r.answer));
    if(c.method)compliant=compliant&&r.teachingMethod===c.method;
    if(c.format==='visual')compliant=compliant&&!!r.visualBlock;
    check('parent_rule_compliance',compliant,false);
  }
  if (d?.responseConstraints.requireVisual)
    check("parent_rule_compliance", !!r.visualBlock, false);
  if (t.evidence.length && t.before?.supportStage)
    check(
      "hinted_evidence",
      t.evidence.every((e) => e.p_support_stage === t.before?.supportStage),
    );
  if (t.input.correctness === "correct" && t.before?.supportStage)
    check(
      "independent_verification",
      after?.supportStage === 0 &&
        after?.phase === "verify_independence" &&
        !!task,
    );
  return result;
}
