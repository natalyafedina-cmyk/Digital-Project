import type { Report } from "./report";
// Persist compact observable traces, never prompts/provider env/complete profile.
export function archive(report: Report) {
  return {
    ...report,
    results: report.results.map((s) => ({
      ...s,
      turns: s.turns.map((t) => ({
        index: t.index,
        studentState:t.studentState,
        input: t.input,
        httpStatus: t.httpStatus,
        before: t.before,
        after: t.after,
        semanticDimensions: t.semanticDimensions,
        latencyMs: t.latencyMs,
        calls: t.calls,
        hard: t.hard,
        judge: t.judge,
        evidence: t.evidence.map((e) => ({
          skillId: e.p_skill_id,
          correctness: e.p_correctness,
          supportStage: e.p_support_stage,
          sttConfidence: e.p_stt_confidence,
          analysisConfidence: e.p_analyzer_confidence,
        })),
        response: {
          answer: t.response.answer,
          taskBlock: t.response.taskBlock,
          visualBlock: t.response.visualBlock,
          requestResolution: t.response.requestResolution,
          pedagogyDecision: t.response.pedagogyDecision,
          analysisMetadata: t.response.analysisMetadata,
        },
        critic: t.critic
          ? {
              flags: t.critic.flags,
              repairAttempted: t.critic.repairAttempted,
              fallbackUsed: t.critic.fallbackUsed,
              fallbackObservation: t.critic.fallbackObservation,
              candidates:
                t.hard.some((h) => !h.pass) ||
                t.judge.flags.length ||
                t.critic.repairAttempted
                  ? t.critic.candidates.map((c) => ({
                      answer: c.answer.slice(0, 1200),
                      taskBlock: c.taskBlock,
                      visualBlock: c.visualBlock?.slice(0, 500),
                      teachingMethod: c.teachingMethod,
                      hintLevel: c.hintLevel,
                    }))
                  : [],
            }
          : null,
      })),
    })),
  };
}
