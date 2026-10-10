import type { TeachingMethod } from "@/lib/adaptive-learning";

export const LEARNING_INTENTS = [
  "explain",
  "solve",
  "short_answer",
  "visualize",
  "memorize",
  "exam_prep",
  "check_homework",
  "practice",
  "unknown",
] as const;

export type LearningIntent = (typeof LEARNING_INTENTS)[number];

export const VISUAL_TYPES = [
  "diagram",
  "map",
  "timeline",
  "table",
  "process",
  "structured_math",
  "comparison",
  "flashcards",
  "graph",
  "word_structure",
  "none",
] as const;

export type VisualType = (typeof VISUAL_TYPES)[number];

type PlanningInput = {
  message: string;
  subject: string;
  previousMethod?: string | null;
  previousOutcome?: number | null;
  currentIntent?: LearningIntent | null;
  currentGoal?: string | null;
  supportStage: number;
};

export type LearningPlan = {
  intent: LearningIntent;
  goal: string;
  visualType: VisualType;
  format: "text" | "visual" | "dialogue" | "practice" | "oral";
  mustChangeMethod: boolean;
  allowedHelpLevel: number;
  methodHint: TeachingMethod;
  taskGeneration: boolean;
};

function has(text: string, expression: RegExp) {
  return expression.test(text);
}

export function isTaskGenerationRequest(message: string) {
  const text = message.toLowerCase();

  const asksForTask = has(
    text,
    /(?:дай|давай|задай|задавай|придумай|предложи|хочу|можно).{0,45}(?:пример|задач|упражнен|вопрос|тест)/
  );
  const practiceWithTask = has(
    text,
    /(?:тренир|практик|потренир).{0,60}(?:пример|задач|упражнен|вопрос|тест)/
  );

  return asksForTask || practiceWithTask;
}


export function isLearnerAttemptMessage(message: string) {
  const text = message.toLowerCase().trim();

  if (!text) return false;

  const conversationManagement = /(?:объясн|покаж|задай|дай\s+(?:мне\s+)?(?:пример|задач|вопрос|упражнен)|проверь.*(?:понял|поняла|меня)|не\s+(?:понимаю|поняла|понял)|по[- ]другому|иначе|что\s+такое|почему|помоги|подскажи|дай\s+подсказ)/;

  return !conversationManagement.test(text);
}

export function computeNextSupportStage(input: {
  currentStage: number;
  message: string;
  correctness: "correct" | "incorrect" | "partial" | "unknown";
}) {
  const stage = Math.max(0, Math.min(4, input.currentStage));
  const text = input.message.toLowerCase();

  if (input.correctness === "correct") return 0;

  const explicitHintRequest =
    /(?:дай\s+подсказ|подскажи|помоги\s+(?:с\s+)?(?:первым|следующим)\s+шагом)/.test(
      text
    );

  if (explicitHintRequest) {
    return Math.min(4, stage + 1);
  }

  const shortNoIdea =
    /^(?:я\s+)?не\s+знаю[.!?]*$/i.test(input.message.trim());

  if (stage > 0 && shortNoIdea) {
    return Math.min(4, stage + 1);
  }

  if (
    (input.correctness === "incorrect" || input.correctness === "partial") &&
    isLearnerAttemptMessage(input.message)
  ) {
    return Math.min(4, stage + 1);
  }

  return stage;
}

export function detectLearningIntent(message: string): LearningIntent {
  const text = message.toLowerCase();

  if (has(text, /проверь.*домаш|домаш.*проверь|провер.*дз/)) return "check_homework";
  if (has(text, /контрольн|самостоятельн|экзамен|подготов/)) return "exam_prep";
  if (has(text, /запомн|выуч|мнемон|карточк/)) return "memorize";

  // Запрос "дай/задай пример" — это начало практики. Слова "столбиком",
  // "схемой" и т. п. описывают формат задания, а не заменяют намерение.
  if (isTaskGenerationRequest(message) || has(text, /тренир|практик|упражнен|проверь меня|тест/)) {
    return "practice";
  }

  if (has(text, /покажи|схем|таблиц|карт[ауе]|диаграм|график|временн.*лини|столбик/)) return "visualize";
  if (has(text, /реши|задач|пример|уравнен|вычисл/)) return "solve";
  if (has(text, /кратк|коротк|одним предложен|ответь.*кратко/)) return "short_answer";
  if (has(text, /объясн|не понимаю|помоги понять|что такое|как работает|почему/)) return "explain";

  return "unknown";
}

export function detectVisualType(message: string, subject: string): VisualType {
  const text = message.toLowerCase();
  if (has(text, /столбик|формул|уравнен|вычисл/)) return "structured_math";
  if (has(text, /временн.*лини|хронолог/)) return "timeline";
  if (has(text, /карт[ауе]|регион|стран/)) return "map";
  if (has(text, /таблиц/)) return "table";
  if (has(text, /сравни|отличи|разниц/)) return "comparison";
  if (has(text, /карточк/)) return "flashcards";
  if (has(text, /график/)) return "graph";
  if (has(text, /строени.*слов|приставк|суффикс|корн/)) return "word_structure";
  if (has(text, /процесс|этап|как происходит/)) return "process";
  if (has(text, /схем|покажи|визуал/)) return "diagram";
  if (["math", "physics"].includes(subject) && has(text, /задач|пример/)) return "structured_math";
  return "none";
}

function pickMethod(intent: LearningIntent, visualType: VisualType): TeachingMethod {
  if (visualType !== "none") return "visual_schema";
  if (intent === "memorize") return "retrieval_practice";
  if (intent === "exam_prep" || intent === "practice") return "dialogue";
  if (intent === "solve") return "step_by_step";
  if (intent === "short_answer") return "comparison";
  return "dialogue";
}

export function buildLearningPlan(input: PlanningInput): LearningPlan {
  const detectedIntent = detectLearningIntent(input.message);
  const text = input.message.toLowerCase();
  const struggleFollowUp = has(
    text,
    /не понимаю|не получается|не выходит|запутал|запуталась|не знаю как|всё равно не понимаю/
  );
  const taskGeneration = isTaskGenerationRequest(input.message);
  const intent =
    input.currentIntent && struggleFollowUp
      ? input.currentIntent
      : detectedIntent;
  const visualType = detectVisualType(input.message, input.subject);
  const previousDidNotHelp =
    typeof input.previousOutcome === "number" && input.previousOutcome < 55;
  const asksForAnotherWay = has(
    text,
    /по[- ]другому|иначе|другим способом|всё равно не понимаю/
  );
  const mustChangeMethod =
    Boolean(input.previousMethod) &&
    (previousDidNotHelp || asksForAnotherWay || struggleFollowUp);

  const format =
    visualType !== "none"
      ? "visual"
      : intent === "practice" || intent === "exam_prep"
      ? "practice"
      : intent === "memorize"
      ? "oral"
      : intent === "solve"
      ? "dialogue"
      : "text";

  const goals: Record<LearningIntent, string> = {
    explain: "понять тему своими словами",
    solve: "сделать следующий самостоятельный шаг в решении",
    short_answer: "сформулировать короткий точный ответ",
    visualize: "увидеть учебную структуру в точном формате",
    memorize: "запомнить через активное воспроизведение",
    exam_prep: "потренироваться и найти пробелы перед проверкой",
    check_homework: "проверить ход работы, не подменяя решение",
    practice: "закрепить навык на одном посильном задании",
    unknown: "уточнить учебную цель и сделать первый понятный шаг",
  };

  return {
    intent,
    goal:
      input.currentGoal && struggleFollowUp
        ? input.currentGoal
        : goals[intent],
    visualType,
    format,
    mustChangeMethod,
    allowedHelpLevel: Math.max(0, Math.min(4, input.supportStage)),
    methodHint: pickMethod(intent, visualType),
    taskGeneration,
  };
}

export function renderLearningPlan(plan: LearningPlan) {
  return [
    `Цель ребёнка: ${plan.goal}.`,
    `Распознанное намерение: ${plan.intent}.`,
    `Формат ответа: ${plan.format}.`,
    `Визуальное представление: ${plan.visualType}.`,
    `Базовый метод: ${plan.methodHint}.`,
    plan.taskGeneration
      ? "Ребёнок просит НОВОЕ тренировочное задание: выдай само условие/пример сразу в этом же ответе. Лестница помощи ограничивает подсказки и решение, но не запрещает числа, необходимые для постановки нового задания."
      : "Это не запрос на генерацию нового задания: не добавляй лишние числовые шаги сверх разрешённой ступени помощи.",
    plan.mustChangeMethod
      ? "Предыдущий способ не помог: обязательно выбери другой метод, а не удлиняй прежнее объяснение."
      : "Сначала удерживай цель ребёнка; не меняй тему без запроса.",
  ].join("\n");
}
