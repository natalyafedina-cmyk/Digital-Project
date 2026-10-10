export type ParentDataConfidence =
  | "insufficient"
  | "early"
  | "enough_for_initial_patterns";

type MethodStat = {
  method: string;
  attempts: number;
  averageOutcome?: number;
  avg?: number;
};

type EvidenceLike = {
  sessionsCount?: number;
  observationCount?: number;
  methodStats?: MethodStat[];
  weakTopics?: Array<{
    subject?: string;
    topic?: string;
    mastery?: number | null;
  }>;
};

export const MIN_METHOD_OBSERVATIONS = 5;

export function comparableMethodStats(methodStats: MethodStat[]) {
  return methodStats.filter(
    (item) => Number(item.attempts) >= MIN_METHOD_OBSERVATIONS
  );
}

export function getParentDataConfidence(input: EvidenceLike): ParentDataConfidence {
  const sessionsCount = Number(input.sessionsCount || 0);
  const observationCount = Number(input.observationCount || 0);
  const comparableMethods = comparableMethodStats(input.methodStats || []);

  if (
    sessionsCount >= 8 &&
    observationCount >= 8 &&
    comparableMethods.length >= 2
  ) {
    return "enough_for_initial_patterns";
  }

  if (sessionsCount >= 2 || observationCount >= 2) {
    return "early";
  }

  return "insufficient";
}

export function buildEvidenceOnlyParentAnalysis(
  childName: string,
  evidence: EvidenceLike
) {
  const sessionsCount = Number(evidence.sessionsCount || 0);
  const observationCount = Number(evidence.observationCount || 0);
  const comparable = comparableMethodStats(evidence.methodStats || []);
  const allMethods = evidence.methodStats || [];
  const weakTopics = evidence.weakTopics || [];

  const lines = [
    `Пока данных недостаточно для уверенного вывода о сильных сторонах, интересе или мотивации ${childName}.`,
    `Сохранено занятий: ${sessionsCount}. Наблюдений для адаптации: ${observationCount}.`,
  ];

  if (comparable.length >= 2) {
    lines.push(
      "Есть несколько методов с повторными наблюдениями, поэтому можно говорить только о предварительном сравнении их результатов."
    );
  } else if (allMethods.length > 0) {
    lines.push(
      "Методы пока нельзя надёжно сравнивать: для такого вывода нужно минимум по 5 наблюдений хотя бы для двух разных методов."
    );
  }

  if (weakTopics.length > 0) {
    lines.push(
      "Есть темы, помеченные системой для повторения, но это технический сигнал, а не характеристика способностей ребёнка."
    );
  } else {
    lines.push("Подтверждённых слабых тем пока нет.");
  }

  return lines.join(" ");
}
