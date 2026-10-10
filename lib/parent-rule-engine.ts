export function hasGameParentRule(
  subject: string,
  parentRules: string[]
) {
  if (subject !== "math") return false;

  return parentRules.some((rule) =>
    /игров|мини[- ]квест|балл|уровн|челлендж/i.test(rule)
  );
}

export function applyParentRuleToTutorResult<T extends {
  answer: string;
  teachingMethod?: string;
}>(
  result: T,
  input: {
    subject: string;
    parentRules: string[];
    taskGeneration: boolean;
  }
): T {
  if (
    input.taskGeneration &&
    hasGameParentRule(input.subject, input.parentRules)
  ) {
    const alreadyGamified =
      /мини[- ]квест|челлендж|уровень|балл|мисси/i.test(result.answer);

    if (!alreadyGamified) {
      return {
        ...result,
        answer: `🎯 Мини-челлендж — 1 балл за самостоятельный ответ. ${result.answer}`,
        teachingMethod: "game",
      };
    }
  }

  return result;
}
