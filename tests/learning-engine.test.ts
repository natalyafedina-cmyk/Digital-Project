import { describe, expect, it } from "vitest";
import {
  buildLearningPlan,
  detectLearningIntent,
  detectVisualType,
} from "@/lib/learning-engine";

describe("adaptive learning engine", () => {
  it("recognises a request to show rather than treating it as generic text", () => {
    expect(detectLearningIntent("Покажи это столбиком, без длинного текста")).toBe("visualize");
    expect(detectVisualType("Покажи это столбиком", "math")).toBe("structured_math");
  });

  it("keeps an exam-preparation goal", () => {
    const plan = buildLearningPlan({
      message: "Помоги подготовиться к контрольной по теме",
      subject: "history",
      supportStage: 0,
    });
    expect(plan.intent).toBe("exam_prep");
    expect(plan.format).toBe("practice");
  });

  it("requires a new method after an observed failure", () => {
    const plan = buildLearningPlan({
      message: "Я всё равно не понимаю, объясни иначе",
      subject: "physics",
      previousMethod: "analogy",
      previousOutcome: 25,
      supportStage: 2,
    });
    expect(plan.mustChangeMethod).toBe(true);
    expect(plan.allowedHelpLevel).toBe(2);
  });

  it("does not invent preferences when there is no evidence", () => {
    const plan = buildLearningPlan({
      message: "Объясни тему",
      subject: "biology",
      supportStage: 0,
    });
    expect(plan.mustChangeMethod).toBe(false);
    expect(plan.methodHint).toBe("dialogue");
  });

  it("changes method after a plain struggle signal", () => {
    const plan = buildLearningPlan({
      message: "Я не понимаю",
      subject: "math",
      previousMethod: "step_by_step",
      supportStage: 1,
    });
    expect(plan.mustChangeMethod).toBe(true);
  });

  it("keeps the original learning goal while the child is still struggling", () => {
    const plan = buildLearningPlan({
      message: "Я всё равно не понимаю",
      subject: "history",
      previousMethod: "story",
      currentIntent: "short_answer",
      currentGoal: "сформулировать короткий точный ответ",
      supportStage: 2,
    });
    expect(plan.intent).toBe("short_answer");
    expect(plan.goal).toBe("сформулировать короткий точный ответ");
  });

  it("allows an explicit new request to replace the previous goal", () => {
    const plan = buildLearningPlan({
      message: "Покажи это на карте",
      subject: "geography",
      currentIntent: "explain",
      currentGoal: "понять тему своими словами",
      supportStage: 1,
    });
    expect(plan.intent).toBe("visualize");
    expect(plan.visualType).toBe("map");
  });
});
