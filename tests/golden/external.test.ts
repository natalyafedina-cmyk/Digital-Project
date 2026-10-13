import { expect, it } from "vitest";
import fixtures from "./scenarios.json";
import catalog from "@/lib/curriculum/catalog-data.json";
import { createLLMProvider } from "@/lib/providers";
import { analyzeLearnerTurn } from "@/lib/learning-analysis";
import { evidenceEligible } from "@/lib/evidence-engine";
const available = process.env.RUN_GOLDEN_EXTERNAL === "1" &&
  ((process.env.LLM_PROVIDER || "yandex") === "yandex" ? Boolean(process.env.YANDEX_API_KEY && process.env.YANDEX_FOLDER_ID) : Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL));
// Explicit opt-in only. Ordinary npm test neither calls providers nor spends API credits.
for(const fixture of fixtures.filter(f=>f.category!=="parent_rules"&&f.category!=="evidence_state")) it.skipIf(!available)(`external ${fixture.id}`,async()=>{
 const llm=createLLMProvider();
 const analysis=await analyzeLearnerTurn(llm,{text:fixture.text,subjectId:fixture.subjectId,courseId:fixture.courseId,
  candidates:catalog.skills.filter(s=>s.id===fixture.skillId&&s.subject_id===fixture.subjectId&&(!s.course_id||s.course_id===fixture.courseId)),previousTask:fixture.previousTask,sttConfidence:fixture.sttConfidence});
 expect(analysis.correctness).toBe(fixture.expected.correctness);
 expect(evidenceEligible(analysis,fixture.sttConfidence)).toBe(fixture.expected.eligible);
},30000);
