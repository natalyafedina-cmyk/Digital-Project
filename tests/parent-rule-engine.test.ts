import { describe, expect, it } from "vitest";
import {
  applyParentRuleToTutorResult,
  hasGameParentRule,
} from "@/lib/parent-rule-engine";

describe("parent rule engine", () => {
  it("detects a math gamification rule", () => {
    expect(
      hasGameParentRule("math", [
        "В занятиях по математике использовать игровые элементы: мини-квесты, баллы, уровни, челленджи.",
      ])
    ).toBe(true);
  });

  it("does not leak a math rule into English", () => {
    expect(
      hasGameParentRule("english", [
        "В занятиях по математике использовать игровые элементы.",
      ])
    ).toBe(false);
  });

  it("adds a lightweight game wrapper to a generated math task", () => {
    const result = applyParentRuleToTutorResult(
      {
        answer: "Число 123 делится на 3?",
        teachingMethod: "dialogue",
      },
      {
        subject: "math",
        parentRules: [
          "В занятиях по математике использовать игровые элементы: мини-квесты, баллы, уровни, челленджи.",
        ],
        taskGeneration: true,
      }
    );

    expect(result.answer).toContain("Мини-челлендж");
    expect(result.answer).toContain("Число 123 делится на 3?");
    expect(result.teachingMethod).toBe("game");
  });
});
