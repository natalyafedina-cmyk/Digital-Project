import { expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { unknownAnalysis, validateAnalysis, analyzeLearnerTurn } from "@/lib/learning-analysis";
import { summarizeEvidence, evidenceEligible, type Evidence } from "@/lib/evidence-engine";
import { acceptResponse, deterministicCritic } from "@/lib/response-critic";
import { blankColumnScaffold } from "@/lib/response-critic/structured-math";
const input={text:"Мой ответ",subjectId:"math",courseId:"math.algebra",candidates:[{id:"known",subject_id:"math",course_id:"math.algebra",title:"Known skill"}]};
const reliable={attemptKind:"answer",correctness:"correct",confidence:.9,skillIds:["known"],errorClasses:[],evidenceSummary:"Learner showed a step"};
const context={stage:0,sourceText:"x + 1",taskGeneration:false,wantsVisual:false,english:false,mustChangeMethod:false,previousMethod:null,analysis:unknownAnalysis(input,"non_attempt"),rules:[]};
it("analyzer errors/invalid JSON never become a learner mistake",async()=>{
 for(const generate of [vi.fn().mockRejectedValue(new Error("secret")),vi.fn().mockResolvedValue("not json")]){
  const analysis=await analyzeLearnerTurn({generate},input);expect(analysis.correctness).toBe("unknown");expect(analysis.learningEvidenceEligible).toBe(false);
 }
 expect(validateAnalysis({...reliable,skillIds:["invented"]},input).skillIds).toEqual([]);
});
it("independent success differs from hinted success and one mistake does not destroy mastery",()=>{
 const event=(correctness:Evidence["correctness"],supportStage:number,sessionId:string):Evidence=>({correctness,supportStage,sessionId,date:"2026-10-13"});
 const history=[event("correct",0,"one"),event("correct",0,"one"),event("correct",0,"two")];
 expect(summarizeEvidence(history).status).toBe("mastered");
 expect(summarizeEvidence([...history,event("incorrect",0,"two")],"mastered").status).toBe("mastered");
 expect(summarizeEvidence([...history,event("incorrect",0,"two"),event("incorrect",0,"two")],"mastered").status).toBe("needs_review");
 expect(summarizeEvidence([event("correct",2,"one")])).toMatchObject({independent_successes:0,hinted_successes:1,status:"introduced",mastery_score:null});
 expect(summarizeEvidence([event("correct",0,"one"),event("partial",0,"two")]).status).toBe("learning");
 expect(evidenceEligible(validateAnalysis(reliable,input),.64)).toBe(false);
});
it("critic limits repairs to one and falls back after two bad candidates",async()=>{
 const generate=vi.fn().mockResolvedValue({answer:"Ответ: 42",visualBlock:null,teachingMethod:"dialogue",hintLevel:4});
 const accepted=await acceptResponse(generate,context);expect(generate).toHaveBeenCalledTimes(2);expect(accepted.result.answer).not.toContain("42");
 expect(deterministicCritic(accepted.result,context)).toEqual([]);expect(accepted.flags).toContain("premature_answer");
});
it("critic covers failed method, concise preference and forbidden content",()=>{
 const rules=[{id:"r",child_id:null,active:true,rule_text:"Коротко",structured_rule:{category:"format",effect:"limit" as const,instruction:"Коротко",subjectId:null,courseId:null,skillId:null,trigger:{},duration:{type:"permanent" as const},priority:50,confidence:1,ambiguity:null,constraints:{maxSentences:1,forbiddenTerms:["forbidden"]}}}];
 const flags=deterministicCritic({answer:"First sentence. Second forbidden sentence.",visualBlock:null,teachingMethod:"story",hintLevel:0},{...context,mustChangeMethod:true,previousMethod:"story",rules});
 expect(flags).toEqual(expect.arrayContaining(["reused_failed_method","excessive_verbosity","parent_rule_violation"]));
});
it("semantic critic failure retains deterministic protection without creating evidence",async()=>{
 const generate=vi.fn().mockResolvedValue({answer:"Проверь один шаг. Затем ответь по-английски.",visualBlock:null,teachingMethod:"dialogue",hintLevel:0});
 const analysis=validateAnalysis({...reliable,correctness:"incorrect"},input);
 const accepted=await acceptResponse(generate,{...context,analysis,english:true},{generate:vi.fn().mockRejectedValue(new Error("unavailable"))});
 expect(accepted.result.answer).toContain("попробуй исправить");expect(analysis.correctness).toBe("incorrect");
});
it("generic visual formatter right-aligns operands and never fills a low-support scaffold",()=>{
 const text=blankColumnScaffold("45 × 36")!;expect(text).toContain("45");expect(text).toContain("36");expect(text).not.toContain("1620");
 const lines=text.split("\n");expect(lines[0].length).toBe(lines[1].length);expect(lines.slice(3).some(line=>/^\s*\d/.test(line))).toBe(false);
 expect(blankColumnScaffold("207 × 18")).not.toBeNull();
});
it("runtime has no legacy phrase dictionary, math-only parent parser or learner/content patch",()=>{
 function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(`${dir}/${e.name}`):/\.(?:tsx?|jsx?|json)$/.test(e.name)?[`${dir}/${e.name}`]:[]);}
 const source=files("app").concat(files("lib")).map(f=>readFileSync(f,"utf8")).join("\n").toLowerCase();
 expect(source).not.toMatch(/i like read|my favou?rite hobby is read|yesterday.{0,120}.*go/);
 const tutor=readFileSync("app/api/tutor/route.ts","utf8");expect(tutor).not.toMatch(/СОФЬИ, 7 КЛАСС|45\s*[×*]\s*36|1620/);
 expect(readFileSync("lib/parent-rule-engine.ts","utf8")).not.toMatch(/hasGameParentRule|subject\s*===\s*["']math["']|игров.*\/i/);
});
it("analyzes a mixed help/answer turn without treating the heuristic as absolute",async()=>{
 const analysis=await analyzeLearnerTurn({generate:vi.fn().mockResolvedValue(JSON.stringify(reliable))},{...input,text:"Объясни, мой ответ получился таким"});
 expect(analysis.correctness).toBe("correct");
});
it("allows new task values and unsolved equations, but rejects completed arithmetic",()=>{
 const candidate={answer:"Реши уравнение x + 5 = 12.",visualBlock:null,teachingMethod:"dialogue",hintLevel:0};
 expect(deterministicCritic(candidate,{...context,taskGeneration:true})).not.toContain("premature_answer");
 expect(deterministicCritic({...candidate,answer:"5 + 7 = 12"},{...context,taskGeneration:true})).toContain("premature_answer");
});
it("does not expose a completed beginner translation when semantic checking is unavailable",async()=>{
 const accepted=await acceptResponse(async()=>({answer:"Готовое предложение на английском. Ответь по-английски.",visualBlock:null,teachingMethod:"dialogue",hintLevel:0}),
  {...context,english:true}, {generate:vi.fn().mockRejectedValue(new Error("unavailable"))});
 expect(accepted.result.answer).not.toContain("Готовое предложение");expect(accepted.result.answer).toContain("по-английски");
});
