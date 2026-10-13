import { isTaskGenerationRequest } from "@/lib/learning-engine";
import { expect, it, vi } from "vitest";
import fixtures from "./scenarios.json";
import catalog from "@/lib/curriculum/catalog-data.json";
import { analyzeLearnerTurn } from "@/lib/learning-analysis";
import { deterministicCritic, safeResponse } from "@/lib/response-critic";
import { resolveParentRules, interpretParentRule } from "@/lib/parent-rule-engine";
import type { StructuredParentRule } from "@/lib/parent-rule-engine";
import { summarizeEvidence, type Evidence } from "@/lib/evidence-engine";
import { evidenceEligible } from "@/lib/evidence-engine";
for (const rawFixture of fixtures) { const fixture = rawFixture as typeof rawFixture & { history?: Evidence[]; expectedStatus?: string }; it(`${fixture.id} ${fixture.category}`,async()=>{
 if(fixture.history) expect(summarizeEvidence(fixture.history).status).toBe(fixture.expectedStatus);
 const candidates = catalog.skills.filter(s=>s.id===fixture.skillId && s.subject_id===fixture.subjectId && (!s.course_id || s.course_id===fixture.courseId));
 const analysis = await analyzeLearnerTurn({generate:vi.fn().mockResolvedValue(JSON.stringify(fixture.modelAnalysis))}, {text:fixture.text,subjectId:fixture.subjectId,courseId:fixture.courseId,candidates,previousTask:fixture.previousTask,sttConfidence:fixture.sttConfidence});
 expect(analysis.correctness).toBe(fixture.expected.correctness);
 expect(evidenceEligible(analysis,fixture.sttConfidence)).toBe(fixture.expected.eligible);
 if(fixture.expected.errorClass) expect(analysis.errorClasses).toContain(fixture.expected.errorClass);
 const context = {stage:fixture.stage,sourceText:fixture.previousTask+fixture.text,taskGeneration:isTaskGenerationRequest(fixture.text),wantsVisual:fixture.category==="visual_format",english:fixture.subjectId==="english",mustChangeMethod:fixture.category==="method_switching",previousMethod:"story",analysis,rules:[]};
 if(context.taskGeneration) expect(fixture.candidate.answer).toMatch(/задание|задач|вопрос|пример/i);
 const flags = deterministicCritic(fixture.candidate,context);
 for(const flag of fixture.expectedFlags) expect(flags).toContain(flag);
 if(fixture.subjectId==="english" && analysis.correctness!=="unknown") {const fallback=safeResponse(context);expect(fallback.answer).toMatch(/[а-яё]/i);expect(fallback.answer).toContain("по-английски");}
 if(fixture.rule){
  const interpretation=await interpretParentRule({generate:vi.fn().mockResolvedValue(JSON.stringify({rule:fixture.rule}))},fixture.text,"2026-10-13T00:00:00Z");
  expect(interpretation.needsClarification).toBe(false);
  const rule={id:fixture.id,active:true,child_id:"child",rule_text:fixture.text,structured_rule:fixture.rule as StructuredParentRule};
  const scope={childId:"child",subjectId:fixture.subjectId,courseId:fixture.rule.courseId||fixture.courseId,skillIds:[],intent:"practice",taskGeneration:true,modality:"text",now:"2026-10-13T00:00:00Z"};
  expect(resolveParentRules([rule],scope)).toHaveLength(1);
  if(fixture.rule.subjectId)expect(resolveParentRules([rule],{...scope,subjectId:"other"})).toHaveLength(0);
 }
}); }
