import {
  SUBJECTS,
  STUDY_MODES,
  buildTutorInstructions,
  type SubjectSlug,
  type StudyModeSlug,
} from "@/lib/tutor-config";
import {
  getSubjectAdaptivePrompt,
  METHOD_LABELS,
  type TeachingMethod,
} from "@/lib/adaptive-learning";
import {
  LEARNING_INTENTS,
  buildLearningPlan,
  computeNextSupportStage,
  isLearnerAttemptMessage,
  renderLearningPlan,
  type LearningIntent,
} from "@/lib/learning-engine";

export const runtime = "nodejs";

type HistoryItem = { role: "user" | "assistant"; text: string };

type MethodSummary = {
  method: string;
  attempts: number;
  avgOutcome: number;
};

function requireEnv() {
  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;

  if (!apiKey) throw new Error("YANDEX_API_KEY не найден в .env.local");
  if (!folderId) throw new Error("YANDEX_FOLDER_ID не найден в .env.local");

  return { apiKey, folderId };
}

function dataUrlToBase64(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Не удалось прочитать изображение.");
  return { mimeType: match[1], base64: match[2] };
}

async function recognizeImage(
  imageDataUrl: string,
  apiKey: string,
  folderId: string
) {
  const { mimeType, base64 } = dataUrlToBase64(imageDataUrl);

  const response = await fetch(
    "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${apiKey}`,
        "x-folder-id": folderId,
        "x-data-logging-enabled": "false",
      },
      body: JSON.stringify({
        mimeType,
        languageCodes: ["ru", "en"],
        model: "page",
        content: base64,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error?.message ||
        "Yandex Vision не смог распознать изображение."
    );
  }

  return data?.result?.textAnnotation?.fullText?.trim() || "";
}

function parseModelJson(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    const parsed = JSON.parse(cleaned);
    const previousMethodOutcome =
      parsed.previousMethodOutcome === null ||
      parsed.previousMethodOutcome === undefined
        ? null
        : Math.max(0, Math.min(100, Number(parsed.previousMethodOutcome)));

    const teachingMethod =
      typeof parsed.teachingMethod === "string"
        ? parsed.teachingMethod
        : "dialogue";

    return {
      answer:
        typeof parsed.answer === "string"
          ? parsed.answer.trim()
          : "Давай попробуем ещё раз.",
      visualBlock:
        typeof parsed.visualBlock === "string" && parsed.visualBlock.trim()
          ? parsed.visualBlock.trim()
          : null,
      visualLabel:
        typeof parsed.visualLabel === "string" && parsed.visualLabel.trim()
          ? parsed.visualLabel.trim()
          : null,
      teachingMethod,
      previousMethodOutcome:
        Number.isFinite(previousMethodOutcome as number)
          ? previousMethodOutcome
          : null,
      previousMethodEvidence:
        typeof parsed.previousMethodEvidence === "string"
          ? parsed.previousMethodEvidence.trim()
          : "",
      topic: typeof parsed.topic === "string" ? parsed.topic.trim() : "",
      hintLevel: Number.isFinite(Number(parsed.hintLevel))
        ? Math.max(0, Math.min(4, Number(parsed.hintLevel)))
        : 0,
      independenceScore: Number.isFinite(Number(parsed.independenceScore))
        ? Math.max(0, Math.min(100, Number(parsed.independenceScore)))
        : 70,
      correctness: ["correct", "incorrect", "partial", "unknown"].includes(
        parsed.correctness
      )
        ? parsed.correctness
        : "unknown",
      needsReview: Boolean(parsed.needsReview),
      supportSignal: ["none", "struggling", "progress", "solved"].includes(
        parsed.supportSignal
      )
        ? parsed.supportSignal
        : "none",
      topicEvidence:
        typeof parsed.topicEvidence === "string"
          ? parsed.topicEvidence.trim()
          : "",
    };
  } catch {
    return {
      answer: raw.trim() || "Давай попробуем ещё раз.",
      visualBlock: null,
      visualLabel: null,
      teachingMethod: "dialogue",
      previousMethodOutcome: null,
      previousMethodEvidence: "",
      topic: "",
      hintLevel: 0,
      independenceScore: 70,
      correctness: "unknown",
      needsReview: false,
      supportSignal: "none",
      topicEvidence: "",
    };
  }
}

function extractNumbers(text: string) {
  return text.match(/\d+(?:[.,]\d+)?/g) || [];
}

function violatesSupportStage(
  result: ReturnType<typeof parseModelJson>,
  stage: number,
  context: string,
  taskGeneration = false
) {
  if (stage >= 3) return false;

  const combined = [result.answer, result.visualBlock || ""].join("\n");
  const allowedNumbers = new Set(extractNumbers(context));
  const introducedNumbers = extractNumbers(combined).filter(
    (value) => !allowedNumbers.has(value)
  );

  // Новое тренировочное задание может содержать новые числа уже на уровне 0:
  // лестница помощи ограничивает решение, а не само условие задачи.
  if (!taskGeneration && stage <= 1 && introducedNumbers.length > 0) return true;

  if (
    stage === 0 &&
    /(?:готов(?:ый|ое)\s+ответ|ответ\s*[:=]|получ(?:ается|ится|им)|итог\s*[:=]|равно\s+\d|=\s*\d)/i.test(
      combined
    )
  ) {
    return true;
  }

  if (
    stage <= 2 &&
    /(?:ответ|итог)\s*[:=\-]?\s*\d/i.test(combined)
  ) {
    return true;
  }

  return false;
}

function safeSupportFallback(
  result: ReturnType<typeof parseModelJson>,
  stage: number,
  wantsVisual: boolean
) {
  const answer =
    stage === 0
      ? wantsVisual
        ? "Покажу только структуру, без решения. Сначала назови, какой шаг ты сделаешь первым."
        : "Сначала проверь свой ход сама: какой шаг ты сделала первым и почему?"
      : stage === 1
      ? "Дам маленькую подсказку: назови только первый шаг, который нужно сделать. Я проверю его."
      : "Разберём один микро-шаг вместе, а дальше продолжишь сама.";

  return {
    ...result,
    answer,
    visualBlock: null,
    visualLabel: null,
    hintLevel: stage,
    correctness: "unknown" as const,
    supportSignal: "struggling" as const,
  };
}

function safeIncorrectAttemptFallback(
  result: ReturnType<typeof parseModelJson>,
  subject: SubjectSlug
) {
  const answer =
    subject === "history"
      ? "Проверь свою версию ещё раз. Вспомни, что именно было предметом спора между сторонами, и попробуй назвать одну конкретную причину сама."
      : subject === "literature"
      ? "Проверь свою версию ещё раз: вернись к поступку, мотиву или детали текста, на которой строился вопрос, и попробуй сформулировать ответ сама."
      : "Проверь свою версию ещё раз. Вернись к ключевой связи из объяснения и попробуй назвать один конкретный шаг или факт сама.";

  return {
    ...result,
    answer,
    visualBlock: null,
    visualLabel: null,
    hintLevel: 0,
    supportSignal: "struggling" as const,
  };
}

function renderMethodProfile(methods: MethodSummary[]) {
  if (!methods.length) {
    return "Данных об эффективности методов пока недостаточно. Не делай выводов о стиле обучения ребёнка как о факте.";
  }

  const enough = methods.filter((item) => item.attempts >= 2);

  if (!enough.length) {
    return "Есть первые наблюдения, но ни один метод ещё не проверен хотя бы дважды. Не называй предпочтения ребёнка установленными.";
  }

  const sorted = [...enough].sort((a, b) => b.avgOutcome - a.avgOutcome);
  return sorted
    .map((item) => {
      const label =
        METHOD_LABELS[item.method as TeachingMethod] || item.method;
      return `- ${label}: ${item.attempts} наблюдений, средний результат ${Math.round(
        item.avgOutcome
      )}/100`;
    })
    .join("\n");
}

export async function POST(request: Request) {
  try {
    const { apiKey, folderId } = requireEnv();
    const body = await request.json();

    const subject = body.subject as SubjectSlug;
    const mode = body.mode as StudyModeSlug;
    const message =
      typeof body.message === "string" ? body.message.trim() : "";
    const imageDataUrl =
      typeof body.imageDataUrl === "string" ? body.imageDataUrl : null;

    const history: HistoryItem[] = Array.isArray(body.history)
      ? body.history.slice(-18)
      : [];

    const parentRules: string[] = Array.isArray(body.parentRules)
      ? body.parentRules.filter((x: unknown) => typeof x === "string").slice(0, 20)
      : [];

    const methodProfile: MethodSummary[] = Array.isArray(body.methodProfile)
      ? body.methodProfile.slice(0, 20)
      : [];

    const previousMethod =
      typeof body.previousMethod === "string" ? body.previousMethod : null;

    const currentIntent =
      typeof body.currentIntent === "string" &&
      LEARNING_INTENTS.includes(body.currentIntent as LearningIntent)
        ? (body.currentIntent as LearningIntent)
        : null;

    const currentGoal =
      typeof body.currentGoal === "string" && body.currentGoal.trim()
        ? body.currentGoal.trim()
        : null;

    const supportStage = Number.isFinite(Number(body.supportStage))
      ? Math.max(0, Math.min(4, Number(body.supportStage)))
      : 0;

    if (!(subject in SUBJECTS) || !(mode in STUDY_MODES)) {
      return Response.json(
        { error: "Неизвестный предмет или режим занятия." },
        { status: 400 }
      );
    }

    if (!message && !imageDataUrl) {
      return Response.json(
        { error: "Нужно отправить текст или изображение." },
        { status: 400 }
      );
    }

    let imageText = "";
    if (imageDataUrl) {
      imageText = await recognizeImage(imageDataUrl, apiKey, folderId);
    }

    const userText = [
      message || "Помоги мне разобраться с прикреплённым заданием.",
      imageText
        ? `\nТекст, распознанный на изображении:\n---\n${imageText}\n---`
        : "",
    ]
      .join("")
      .trim();

    const adaptiveProfileText = renderMethodProfile(methodProfile);
    const subjectPrompt = getSubjectAdaptivePrompt(subject);
    const learningPlan = buildLearningPlan({
      message: userText,
      subject,
      previousMethod,
      currentIntent,
      currentGoal,
      supportStage,
    });

    const pedagogy = `
ТЫ — ПЕРСОНАЛЬНЫЙ AI-РЕПЕТИТОР ЛУНИК ДЛЯ СОФЬИ, 7 КЛАСС.

ТВОЯ ЦЕЛЬ:
1. Помочь понять материал.
2. Сохранять самостоятельность ребёнка.
3. Заинтересовывать, а не читать лекцию.
4. Менять способ объяснения, если предыдущий не помог.
5. Постепенно адаптироваться только по реальным данным занятий.

ЖЁСТКАЯ ЛЕСТНИЦА ПОМОЩИ:
Текущий уровень помощи = ${supportStage}. НЕЛЬЗЯ перескакивать через уровни.

Уровень 0 — самопроверка:
- если ребёнок ошибся, НЕ давай вычислений, подсказок, частичных произведений или ответа;
- попроси проверить конкретное место: знак, перенос, порядок действий, разряд;
- можно задать ОДИН направляющий вопрос, но без числовой подсказки.

Уровень 1 — маленькая подсказка:
- укажи только, ЧТО нужно проверить или с чего начать;
- не вычисляй за ребёнка;
- если нужна визуализация, показывай ТОЛЬКО каркас с пустыми местами.

Уровень 2 — конкретная подсказка:
- можно показать один принцип или один микро-шаг;
- нельзя показывать весь ход решения и финальный ответ;
- для столбика по математике допускается только каркас и одна заполненная операция максимум.

Уровень 3 — один шаг вместе:
- реши ровно один подшаг;
- оставь следующие строки/ответ пустыми;
- попроси ребёнка продолжить самому.

Уровень 4 — полный разбор:
- полный разбор разрешён только после нескольких предыдущих попыток;
- даже здесь сначала объясни структуру, а потом решение.

СТИЛЬ:
- По умолчанию ответ короткий: обычно 2–5 предложений.
- Если ребёнок просит объяснить тему, сначала ДАЙ понятное объяснение по существу, а не заменяй его наводящим вопросом.
- Сначала используй конкретные факты и простые слова; учебный термин вводи после смысла и сразу коротко расшифровывай.
- Не начинай ответы по шаблону фразами "Давай подумаем", "Представим ситуацию", "Как ты думаешь". Особенно не повторяй одну и ту же вводную в соседних ответах.
- Если ребёнок сказал "не понял/не поняла" или "объясни по-другому", измени ПРЕДСТАВЛЕНИЕ материала: например текст → мини-сюжет, причины/следствия, сравнение, схема или временная линия. Не просто переписывай прежний абзац другими словами.
- Не повторяй длинными словами то, что можно показать схемой.
- Если ребёнок просит "покажи", "схемой", "столбиком", "таблицей", "не текстом" — обязательно используй visualBlock.
- Если visualBlock используется на уровнях 0–2, он НЕ должен содержать финальный ответ.
- Если visualBlock используется на уровнях 0–1, он не должен содержать вычисленные промежуточные результаты.
- ВАЖНО: если ребёнок просит "дай/задай пример", сразу дай новое задание в этом же ответе. Не заставляй ребёнка сначала описывать шаги. Числа самого НОВОГО задания разрешены на любом уровне помощи; запрещены только подсказки-вычисления и готовое решение.
- Не говори "я не могу изобразить", если это можно показать текстовой схемой.
- Если предыдущий способ не помог, выбери ДРУГОЙ teachingMethod.
- Не делай выводов о характере, эмоциях или "типе обучения" ребёнка по 1–2 сообщениям.
- Не используй LaTeX: $, $$, \\times, \\frac, \\sqrt.
- Математика: ×, ÷, =, +, −, %, √, x², x³, 3/4.

ОСОБЕННО ДЛЯ УМНОЖЕНИЯ В СТОЛБИК:
- выравнивай числа ПО ПРАВОМУ КРАЮ;
- используй моноширинную запись с пробелами;
- второй частичный результат показывай ПОЛНЫМ числом с нулём, а не "135 со сдвигом";
- правильный полный вид, когда полный разбор уже разрешён:
     45
  ×  36
  -----
    270
   1350
  -----
   1620
- на уровнях 0–2 вместо готовых чисел используй подчёркивания:
     45
  ×  36
  -----
    ___
   ____
  -----
   ____

${subjectPrompt}

ПЛАН ДВИЖКА ОБУЧЕНИЯ:
${renderLearningPlan(learningPlan)}

Не меняй намерение ребёнка на другое. Если выбран visualType не "none", верни visualBlock именно такого типа: точная учебная структура, а не декоративная картинка.
Если taskGeneration=true, ответ обязан содержать само новое задание сразу, без предварительных просьб "назови первый шаг".

ПРАВИЛА РОДИТЕЛЯ:
${
  parentRules.length
    ? parentRules.map((rule, i) => `${i + 1}. ${rule}`).join("\n")
    : "Дополнительных правил нет."
}

НАБЛЮДАЕМАЯ ЭФФЕКТИВНОСТЬ МЕТОДОВ:
${adaptiveProfileText}

ПРЕДЫДУЩИЙ МЕТОД:
${previousMethod || "нет"}

Если previousMethod есть, оцени по НОВОМУ сообщению ребёнка, помог ли именно предыдущий способ объяснения.
previousMethodOutcome:
- 80–100: ребёнок понял/продвинулся после метода;
- 55–79: помог частично;
- 0–54: метод не помог или ребёнок всё ещё явно не понимает;
- null: данных недостаточно.
Не выдавай оценку как факт, если по сообщению нельзя понять результат.

НУЖЕН СТРОГО JSON БЕЗ MARKDOWN:
{
  "answer": "короткий ответ Софье",
  "visualBlock": "наглядная схема или пустая строка",
  "visualLabel": "короткая подпись к схеме или пустая строка",
  "teachingMethod": "один метод",
  "previousMethodOutcome": null,
  "previousMethodEvidence": "коротко, на каком наблюдаемом сигнале основана оценка",
  "topic": "краткая тема",
  "topicEvidence": "какие слова ребёнка подтверждают тему; пустая строка, если данных нет",
  "hintLevel": 0,
  "independenceScore": 0,
  "correctness": "correct|incorrect|partial|unknown",
  "needsReview": false,
  "supportSignal": "none|struggling|progress|solved"
}

Допустимые teachingMethod:
visual_schema, worked_example, step_by_step, analogy, game, dialogue,
retrieval_practice, comparison, oral_practice, timeline, cause_effect,
classification, story, experiment, map_logic, character_analysis.
`;

    const messages = [
      {
        role: "system",
        text:
          buildTutorInstructions(subject, mode) +
          "\n\n" +
          pedagogy,
      },
      ...history.map((item) => ({
        role: item.role,
        text: item.text,
      })),
      { role: "user", text: userText },
    ];

    const response = await fetch(
      "https://ai.api.cloud.yandex.net/foundationModels/v1/completion",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Api-Key ${apiKey}`,
          "x-folder-id": folderId,
          "x-data-logging-enabled": "false",
        },
        body: JSON.stringify({
          modelUri: `gpt://${folderId}/yandexgpt/latest`,
          completionOptions: {
            stream: false,
            temperature: 0.35,
            maxTokens: "1300",
            reasoningOptions: { mode: "ENABLED_HIDDEN" },
          },
          messages,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.message ||
          data?.error?.message ||
          "YandexGPT не смог сформировать ответ."
      );
    }

    let raw =
      data?.result?.alternatives?.[0]?.message?.text?.trim() || "";

    let parsed = parseModelJson(raw);
    const supportContext = [
      ...history.map((item) => item.text),
      userText,
    ].join("\n");

    if (
      violatesSupportStage(
        parsed,
        supportStage,
        supportContext,
        learningPlan.taskGeneration
      )
    ) {
      const retryMessages = messages.map((item, index) =>
        index === 0
          ? {
              ...item,
              text:
                item.text +
                "\n\nКРИТИЧЕСКАЯ ПРОВЕРКА: предыдущая генерация нарушила текущую ступень помощи. Перегенерируй ответ строго в пределах уровня " +
                supportStage +
                ". Не добавляй вычислений, промежуточных результатов или готового ответа, которые ещё не разрешены этим уровнем.",
            }
          : item
      );

      const retryResponse = await fetch(
        "https://ai.api.cloud.yandex.net/foundationModels/v1/completion",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Api-Key ${apiKey}`,
            "x-folder-id": folderId,
            "x-data-logging-enabled": "false",
          },
          body: JSON.stringify({
            modelUri: `gpt://${folderId}/yandexgpt/latest`,
            completionOptions: {
              stream: false,
              temperature: 0.2,
              maxTokens: "1100",
              reasoningOptions: { mode: "ENABLED_HIDDEN" },
            },
            messages: retryMessages,
          }),
        }
      );

      const retryData = await retryResponse.json();
      if (retryResponse.ok) {
        raw =
          retryData?.result?.alternatives?.[0]?.message?.text?.trim() || raw;
        parsed = parseModelJson(raw);
      }

      if (
        violatesSupportStage(
          parsed,
          supportStage,
          supportContext,
          learningPlan.taskGeneration
        )
      ) {
        parsed = safeSupportFallback(
          parsed,
          supportStage,
          learningPlan.visualType !== "none"
        );
      }
    }

    // На первой ошибке защищаем самостоятельность ребёнка детерминированно:
    // модель не должна случайно раскрыть правильный ответ в гуманитарном предмете.
    if (
      supportStage === 0 &&
      (parsed.correctness === "incorrect" || parsed.correctness === "partial") &&
      isLearnerAttemptMessage(userText)
    ) {
      parsed = safeIncorrectAttemptFallback(parsed, subject);
    }

    const nextSupportStage = computeNextSupportStage({
      currentStage: supportStage,
      message: userText,
      correctness: parsed.correctness,
    });

    return Response.json({
      ...parsed,
      intent: learningPlan.intent,
      goal: learningPlan.goal,
      visualType: learningPlan.visualType,
      requestedFormat: learningPlan.format,
      methodChangeRequired: learningPlan.mustChangeMethod,
      supportStageUsed: supportStage,
      nextSupportStage,
      recognizedImageText: imageText || null,
    });
  } catch (error) {
    console.error("Tutor API error:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось получить ответ Луника.",
      },
      { status: 500 }
    );
  }
}
