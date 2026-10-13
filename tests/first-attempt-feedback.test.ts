import { expect, it } from "vitest";
import { safeResponse } from "@/lib/response-critic";
import { unknownAnalysis } from "@/lib/learning-analysis";
it("gives generic first-error feedback with Russian support and a fresh English retry", () => {
 const analysis = { ...unknownAnalysis({text:"",subjectId:"english",courseId:"english.language",candidates:[]},""), correctness:"incorrect" as const, errorClasses:["grammar_form"] };
 const result = safeResponse({stage:0,sourceText:"",taskGeneration:false,wantsVisual:false,english:true,mustChangeMethod:false,previousMethod:null,analysis,rules:[]});
 expect(result.answer).toMatch(/[а-яё]/i); expect(result.answer).toContain("по-английски"); expect(result.answer).toContain("попробуй исправить");
});
