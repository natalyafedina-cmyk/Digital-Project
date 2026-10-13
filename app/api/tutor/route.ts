import { analyzeLearnerTurn, shouldAnalyze } from "@/lib/learning-analysis";
import { candidateSkills } from "@/lib/learning-analysis/repository";
import { recordAcceptedEvidence } from "@/lib/evidence-engine";
import { resolveParentRules, renderParentRules, type ParentRule } from "@/lib/parent-rule-engine";
import { acceptResponse } from "@/lib/response-critic";
import { authenticatedRequestClient } from "@/lib/supabase/request-client";
import { getActiveLearningContext, renderAcademicContext } from "@/lib/curriculum/learning-context";
import { SupabaseCurriculumRepository } from "@/lib/curriculum/repository";
import { resolveCourse } from "@/lib/curriculum/catalog";
import { createLLMProvider, createVisionProvider, withFailover } from "@/lib/providers";
import { learnerConfig } from "@/lib/learner-config";
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
      answer: "",
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
    const llm = createLLMProvider();
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

    const courseId = typeof body.courseId === "string" ? body.courseId : undefined;
    let course;
    try { course = resolveCourse(subject, courseId); } catch {
      return Response.json({ error: "Курс не относится к выбранному предмету." }, { status: 400 });
    }
    let client = null;
    let academicContext = null;
    let learner = learnerConfig;
    let academicPrompt = course ? `Выбранный курс: ${course.displayName}.` : "";
    if (typeof body.childId === "string" && body.childId) {
      client = await authenticatedRequestClient(request);
      if (!client) return Response.json({ error: "Нужен вход родителя." }, { status: 401 });
      const context = await getActiveLearningContext(body.childId, subject, courseId, new SupabaseCurriculumRepository(client));
      academicContext = context;
      learner = { ...learnerConfig, displayName: context.child.name, grade: context.grade };
      academicPrompt = renderAcademicContext(context);
    }

    let imageText = "";
    if (imageDataUrl) {
      imageText = await createVisionProvider().recognize(imageDataUrl);
    }

    const userText = [
      message || "Помоги мне разобраться с прикреплённым заданием.",
      imageText
        ? `\nТекст, распознанный на изображении:\n---\n${imageText}\n---`
        : "",
    ]
      .join("")
      .trim();

    const sttConfidence = typeof body.sttConfidence === "number" && Number.isFinite(body.sttConfidence) && body.sttConfidence >= 0 && body.sttConfidence <= 1 ? body.sttConfidence : null;
    const analysisInput = { text: userText, subjectId: subject, courseId: course?.id || null, sttConfidence,
      previousTask: history.filter(item => item.role === "assistant").at(-1)?.text,
      candidates: client && shouldAnalyze(userText) ? await candidateSkills(client, subject, course?.id || null, academicContext?.program?.id, academicContext?.grade) : [] };
    const analysis = await analyzeLearnerTurn(llm, analysisInput);
    let knownRules: ParentRule[] = parentRules.map((text, index) => ({ id: String(index), active: true, child_id: null, rule_text: text }));
    if (client && academicContext) {
      const ruleResult = await client.from("tutor_rules").select("id,active,child_id,rule_text,subject,priority,course_id,skill_id,structured_rule,interpretation_status,valid_from,valid_until")
        .eq("active",true).or(`child_id.is.null,child_id.eq.${academicContext.child.id}`).limit(30);
      knownRules = (ruleResult.data || []) as ParentRule[];
    }
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

    const applicableRules = resolveParentRules(knownRules, { childId: academicContext?.child.id || null,
      subjectId: subject, courseId: course?.id || null, skillIds: analysis.skillIds, intent: learningPlan.intent,
      taskGeneration: learningPlan.taskGeneration, modality: ["text","voice","image"].includes(body.inputModality) ? body.inputModality : imageDataUrl ? "image" : "text",
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null });
    let skillSignal = "";
    if (client && academicContext && analysis.skillIds[0]) {
      const state = await client.from("student_skill_state").select("status,independent_successes,hinted_successes")
        .eq("child_id",academicContext.child.id).eq("skill_id",analysis.skillIds[0]).maybeSingle();
      if (state.data) skillSignal = JSON.stringify(state.data) + " Если mastered и practice, предложи короткую проверку или transfer task вместо объяснения с нуля. После помощи проверь самостоятельность на новом похожем задании.";
    }
    const pedagogy = `
ТЫ — ${learner.tutorName}, ПЕРСОНАЛЬНЫЙ РЕПЕТИТОР ${learner.displayName}, КЛАСС ${learner.grade}.
Анализ попытки (не изменяй correctness): ${JSON.stringify(analysis)}
Сигнал навыка: ${skillSignal}
Практика примерно 70%, теория 30%, по ситуации.

ТВОЯ ЦЕЛЬ:
1. Помочь понять материал.
2. Сохранять самостоятельность ребёнка.
3. Заинтересовывать, а не читать лекцию.
4. Менять способ объяснения, если предыдущий не помог.
После помощи проверь самостоятельность на новом похожем задании.
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

STRUCTURED MATH CONTRACT:
- Числа выравниваются справа в моноширинном visualBlock.
- При support 0–1 показывай исходные операнды и пустые строки, без вычисленных результатов.
- При support 2 показывай один принцип, при support 3 ровно один подшаг, при support 4 допустим полный разбор.
- Для разрядных вычислений явно обозначай разряд/нулевой сдвиг; не подменяй полное число сокращённой записью.

${subjectPrompt}

ПЛАН ДВИЖКА ОБУЧЕНИЯ:
${renderLearningPlan(learningPlan)}

Не меняй намерение ребёнка на другое. Если выбран visualType не "none", верни visualBlock именно такого типа: точная учебная структура, а не декоративная картинка.
Если taskGeneration=true, ответ обязан содержать само новое задание сразу, без предварительных просьб "назови первый шаг".

ПРАВИЛА РОДИТЕЛЯ:
${renderParentRules(applicableRules)}

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
  "answer": "короткий ответ ученику ${learner.displayName}",
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
          buildTutorInstructions(subject, mode, learner) +
          "\n\n" + academicPrompt +
          "\n\n" +
          pedagogy,
      },
      ...history.map((item) => ({
        role: item.role,
        text: item.text,
      })),
      { role: "user", text: userText },
    ];

    const criticContext = { grade: learner.grade, courseId: course?.id || null, stage: supportStage, sourceText: history.map(item=>item.text).join("\n") + "\n" + userText,
      taskGeneration: learningPlan.taskGeneration, wantsVisual: learningPlan.visualType !== "none", english: subject === "english",
      mustChangeMethod: learningPlan.mustChangeMethod, previousMethod, analysis, rules: applicableRules };
    const accepted = await acceptResponse(async flags => {
      const candidateMessages = flags ? messages.map((item,index)=> index === 0 ? { ...item, text: item.text + "\nRepair these response violations without changing the learner analysis: " + flags.join(",") } : item) : messages;
      return parseModelJson(await llm.generate({ messages: candidateMessages, temperature: flags ? .2 : .35, maxTokens: 1300 }));
    }, criticContext, llm);
    const parsed = { ...accepted.result, correctness: analysis.correctness, needsReview: false };
    // Existing explicit hint requests may advance help without becoming a knowledge error.
    // Technical/analyzer uncertainty never advances the ladder; management turns remain unchanged.
    const technicalUncertainty = ["stt_uncertain","analyzer_unavailable","invalid_analysis","low_confidence","missing_evidence"].includes(analysis.uncertaintyReason || "");
    const nextSupportStage = technicalUncertainty ? supportStage : computeNextSupportStage({
      currentStage: supportStage, message: userText, correctness: analysis.correctness });
    if (client && academicContext && typeof body.sessionId === "string") {
      try { const evidenceClient = client, childId = academicContext.child.id;
        await withFailover(signal => recordAcceptedEvidence(evidenceClient, { childId, sessionId: body.sessionId,
        turnId: typeof body.turnId === "string" ? body.turnId : crypto.randomUUID(), analysis, supportStage, sttConfidence, signal }), undefined, 3000); }
      catch { console.error("evidence_write_unavailable"); }
    }
    return Response.json({
      ...parsed,
      analysisMetadata: { confidence: analysis.confidence, source: "universal_analyzer", errorClasses: analysis.errorClasses, criticFlags: accepted.flags, evidenceEligible: analysis.learningEvidenceEligible, evidence: analysis.evidenceSummary },
      intent: learningPlan.intent,
      goal: learningPlan.goal,
      visualType: learningPlan.visualType,
      requestedFormat: learningPlan.format,
      methodChangeRequired: learningPlan.mustChangeMethod,
      supportStageUsed: supportStage,
      nextSupportStage,
      recognizedImageText: imageText || null,
    });
  } catch {
    return Response.json({ error: "Не удалось получить ответ репетитора." }, { status: 500 });
  }
}
