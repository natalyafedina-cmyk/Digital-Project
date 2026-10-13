import { expect, it, vi } from "vitest";
import { interpretParentRule, resolveParentRules, renderParentRules, type StructuredParentRule, type ParentRule } from "@/lib/parent-rule-engine";
const game: StructuredParentRule = { category:"format",effect:"require",instruction:"Используй игровые элементы",subjectId:"math",courseId:null,skillId:null,trigger:{taskGeneration:true},duration:{type:"permanent"},priority:50,confidence:.9,ambiguity:null,constraints:{method:"game"} };
const context = { childId:"child",subjectId:"math",courseId:"math.algebra",skillIds:[],intent:"practice",taskGeneration:true,modality:"text",now:"2026-10-13T12:00:00Z" };
const rule: ParentRule = { id:"rule",active:true,child_id:"child",rule_text:game.instruction,structured_rule:game };
it("interprets an arbitrary instruction semantically without executing or writing it", async () => {
 const llm = { generate: vi.fn().mockResolvedValue(JSON.stringify({rule:game})) };
 const interpreted = await interpretParentRule(llm,"По математике используй игровые элементы.");
 expect(interpreted.rule?.constraints?.method).toBe("game"); expect(llm.generate).toHaveBeenCalledTimes(1);
 expect(renderParentRules([rule])).toContain("Hard pedagogy");
});
it("isolates subject/course/child and expires temporary rules", () => {
 expect(resolveParentRules([rule],context)).toHaveLength(1);
 expect(resolveParentRules([rule],{...context,subjectId:"english"})).toHaveLength(0);
 expect(resolveParentRules([rule],{...context,childId:"other"})).toHaveLength(0);
 const course = {...rule,structured_rule:{...game,courseId:"math.geometry"}};
 expect(resolveParentRules([course],context)).toHaveLength(0);
 expect(resolveParentRules([{...rule,valid_until:"2026-10-12"}],context)).toHaveLength(0);
});
it("orders specificity deterministically and preserves raw fallback", () => {
 const specific = {...rule,id:"specific",structured_rule:{...game,courseId:"math.algebra"}};
 expect(resolveParentRules([rule,specific],context)[0].id).toBe("specific");
 expect(renderParentRules([{...rule,structured_rule:null}])).toContain(game.instruction);
});
it("asks clarification instead of inventing an ambiguous scope", async () => {
 const result = await interpretParentRule({generate: vi.fn().mockResolvedValue(JSON.stringify({rule:{...game,ambiguity:"scope"}}))},"Пусть чаще так делает");
 expect(result.needsClarification).toBe(true); expect(result.rule).toBeNull();
});
it("validates a semantic skill scope against the real catalog verifier",async()=>{
 const skillRule={...game,skillId:"known"};
 const llm={generate:vi.fn().mockResolvedValue(JSON.stringify({rule:skillRule}))};
 expect((await interpretParentRule(llm,"Тренируй этот навык",undefined,async id=>id==="known")).needsClarification).toBe(false);
 expect((await interpretParentRule(llm,"Тренируй этот навык")).needsClarification).toBe(true);
 expect(resolveParentRules([{...rule,structured_rule:skillRule}],{...context,skillIds:["known"]})).toHaveLength(1);
 expect(resolveParentRules([{...rule,structured_rule:skillRule}],context)).toHaveLength(0);
});
it("expires timed rules and restricts session-only rules",()=>{
 const timed={...rule,structured_rule:{...game,duration:{type:"until" as const,until:"2026-10-12T00:00:00Z"}}};
 expect(resolveParentRules([timed],context)).toHaveLength(0);
 const session={...rule,structured_rule:{...game,duration:{type:"session" as const,sessionId:"one"}}};
 expect(resolveParentRules([session],{...context,sessionId:"two"})).toHaveLength(0);
 expect(resolveParentRules([session],{...context,sessionId:"one"})).toHaveLength(1);
});
