import type { SupabaseClient } from "@supabase/supabase-js";
import { ANALYSIS_CONFIDENCE_MIN, STT_CONFIDENCE_MIN, type TurnAnalysis } from "@/lib/learning-analysis";
export type Evidence = { correctness: "correct" | "incorrect" | "partial"; supportStage: number; sessionId: string | null; date: string };
export function evidenceEligible(analysis: TurnAnalysis, sttConfidence?: number | null) {
  return analysis.learningEvidenceEligible && ["answer","partial_answer"].includes(analysis.attemptKind) &&
    analysis.skillIds.length > 0 && Boolean(analysis.evidenceSummary) && analysis.confidence >= ANALYSIS_CONFIDENCE_MIN &&
    analysis.correctness !== "unknown" && (sttConfidence == null || sttConfidence >= STT_CONFIDENCE_MIN);
}
// Conservative coverage/status, not a percentage estimate of knowledge. SQL engine mirrors this contract.
export function summarizeEvidence(history: Evidence[], previousStatus = "not_seen") {
  const independent = history.filter(e => e.correctness === "correct" && e.supportStage === 0);
  const hinted = history.filter(e => e.correctness === "correct" && e.supportStage > 0);
  const failures = history.filter(e => e.correctness === "incorrect");
  const contexts = new Set(independent.map(e => e.sessionId || e.date));
  const lastSuccess = history.findLastIndex(e => e.correctness === "correct" && e.supportStage === 0);
  const recentFailures = history.slice(lastSuccess + 1).filter(e => e.correctness === "incorrect" && e.supportStage === 0).length;
  const hadMastery = ["mastered","needs_review"].includes(previousStatus) || independent.length >= 3 && contexts.size >= 2;
  const status = hadMastery ? recentFailures >= 2 ? "needs_review" : "mastered" : independent.length >= 2 ? "nearly_mastered" : history.length > 1 ? "learning" : history.length === 1 ? "introduced" : "not_seen";
  return { status, evidence_count: history.length, independent_successes: independent.length, hinted_successes: hinted.length, failures: failures.length, confidence: Math.min(1, history.length / 5), mastery_score: null };
}
export async function recordAcceptedEvidence(client: SupabaseClient, input: {
  childId: string; sessionId: string; turnId: string; analysis: TurnAnalysis; supportStage: number; sttConfidence?: number | null; signal?: AbortSignal;
}) {
  if (!evidenceEligible(input.analysis, input.sttConfidence)) return;
  for (const skillId of input.analysis.skillIds) {
    const write = client.rpc("record_skill_evidence", {
      p_child_id: input.childId, p_session_id: input.sessionId, p_skill_id: skillId, p_turn_id: input.turnId,
      p_correctness: input.analysis.correctness, p_support_stage: input.supportStage,
      p_stt_confidence: input.sttConfidence ?? null, p_analyzer_confidence: input.analysis.confidence,
      p_metadata: { attemptKind: input.analysis.attemptKind, errorClasses: input.analysis.errorClasses,
        analysisSource: "universal_analyzer", courseId: input.analysis.courseId, evidence: input.analysis.evidenceSummary },
    });
    const { error } = await (input.signal ? write.abortSignal(input.signal) : write);
    if (error) throw new Error("evidence_write_unavailable");
  }
}
