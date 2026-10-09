import { describe, expect, it } from "vitest";
import {
  buildLearningPlan,
  computeNextSupportStage,
  detectLearningIntent,
  detectVisualType,
  isLearnerAttemptMessage,
  isTaskGenerationRequest,
} from "@/lib/learning-engine";

describe("adaptive learning engine", () => {

  it("does not escalate support for an ordinary explanation request", () => {
    expect(
      computeNextSupportStage({
        currentStage: 0,
        message: "Объясни мне коротко, почему началась Столетняя война.",
        correctness: "unknown",
      })
    ).toBe(0);
  });

  it("changes explanation method without escalating the help ladder", () => {
    expect(isLearnerAttemptMessage("Я не поняла. Объясни по-другому.")).toBe(false);

    expect(
      computeNextSupportStage({
        currentStage: 0,
        message: "Я не поняла. Объясни по-другому.",
        correctness: "unknown",
      })
    ).toBe(0);
  });

  it("does not escalate support when the child asks to be checked", () => {
    expect(
      computeNextSupportStage({
        currentStage: 0,
        message: "Теперь проверь, поняла ли я. Задай мне один вопрос.",
        correctness: "unknown",
      })
    ).toBe(0);
  });

  it("increments support by exactly one after a real incorrect attempt", () => {
    const answer = "Королю Англии не нравился король Франции.";

    expect(isLearnerAttemptMessage(answer)).toBe(true);
    expect(
      computeNextSupportStage({
        currentStage: 0,
        message: answer,
        correctness: "incorrect",
      })
    ).toBe(1);
  });

  it("resets support after a correct learner attempt", () => {
    expect(
      computeNextSupportStage({
        currentStage: 2,
        message: "Они спорили о французском престоле и землях.",
        correctness: "correct",
      })
    ).toBe(0);
  });


  it("treats a request for a fresh example as practice even when a visual format is named", () => {
    const message = "Давай потренируем умножение столбиком. Дай мне пример.";

    expect(isTaskGenerationRequest(message)).toBe(true);
    expect(detectLearningIntent(message)).toBe("practice");

    const plan = buildLearningPlan({
      message,
      subject: "math",
      supportStage: 0,
    });

    expect(plan.taskGeneration).toBe(true);
    expect(plan.intent).toBe("practice");
    expect(plan.visualType).toBe("structured_math");
    expect(plan.allowedHelpLevel).toBe(0);
  });

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
