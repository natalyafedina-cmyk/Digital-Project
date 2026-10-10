import { describe, expect, it } from "vitest";
import {
  buildEvidenceOnlyParentAnalysis,
  getParentDataConfidence,
} from "@/lib/parent-analytics";

describe("parent analytics guardrails", () => {
  it("does not call one well-tested method enough for comparison", () => {
    expect(
      getParentDataConfidence({
        sessionsCount: 24,
        observationCount: 18,
        methodStats: [
          { method: "dialogue", attempts: 9, averageOutcome: 58 },
          { method: "analogy", attempts: 2, averageOutcome: 80 },
        ],
      })
    ).toBe("early");
  });

  it("requires two methods with repeated evidence before initial comparison", () => {
    expect(
      getParentDataConfidence({
        sessionsCount: 12,
        observationCount: 10,
        methodStats: [
          { method: "dialogue", attempts: 7, averageOutcome: 60 },
          { method: "analogy", attempts: 5, averageOutcome: 72 },
        ],
      })
    ).toBe("enough_for_initial_patterns");
  });

  it("produces a conservative evidence-only parent summary", () => {
    const answer = buildEvidenceOnlyParentAnalysis("Софья", {
      sessionsCount: 6,
      observationCount: 4,
      methodStats: [{ method: "dialogue", attempts: 3, averageOutcome: 60 }],
      weakTopics: [],
    });

    expect(answer).toContain("недостаточно");
    expect(answer).toContain("Подтверждённых слабых тем пока нет");
    expect(answer).not.toContain("проявляет интерес");
    expect(answer).not.toContain("сильная сторона");
  });
});
