import { requestCatalog } from '@/lib/learning-request/repository';
import { matchCourseClarification,resolveLearningRequest,reuseResolution,validateResolution } from '@/lib/learning-request/resolver';
import { planPedagogy } from '@/lib/pedagogy/planner';
import { acceptedState } from '@/lib/pedagogy/lesson-state';
import { loadLesson,persistLesson,initialState } from '@/lib/pedagogy/repository';
import { analyzeLearnerTurn, shouldAnalyze, unknownAnalysis } from "@/lib/learning-analysis";
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
      taskBlock: parsed.taskBlock && typeof parsed.taskBlock.prompt === 'string' && parsed.taskBlock.prompt.trim() ? {prompt:parsed.taskBlock.prompt.trim().slice(0,1500),skillId:null} : null,
      answer:
        typeof parsed.answer === "string"
          ? parsed.answer.trim()
          : "",
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
      taskBlock: null,
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

    let previousMethod =
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

    let supportStage = Number.isFinite(Number(body.supportStage))
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
    const sessionId=typeof body.sessionId==='string'?body.sessionId:null;
    let lesson=initialState({subjectId:subject,courseId:course?.id||null,curriculumUnitId:null,skillId:null});
    if(client&&academicContext&&sessionId) lesson=await loadLesson(client,sessionId,academicContext.child.id,lesson.target);
    if(client){supportStage=lesson.supportStage;previousMethod=lesson.previousMethod;}
    const awaiting=!!lesson.lastTask&&['attempt_task','retry','answer'].includes(lesson.expectedLearnerAction);
    // Short answers to an existing task reuse its target. New goals still go through semantics.
    const cheapFollowup=reuseResolution(lesson.target,userText);
    const reuse=!!lesson.target.courseId && (awaiting&&shouldAnalyze(userText)&&!/[?？]/.test(userText)&&userText.length<300 || cheapFollowup.requestedActions.some(a=>['ask_for_hint','change_method'].includes(a)));
    let resolution=reuseResolution(lesson.target,userText);
    let resumedClarification=false;
    const pendingClarification =
      lesson.phase==='clarify' &&
      lesson.expectedLearnerAction==='clarify' &&
      lesson.pendingClarification?.originalRequestText
        ? lesson.pendingClarification.originalRequestText
        : null;
    if(client&&pendingClarification&&!(sttConfidence!=null&&sttConfidence<.65)){
      const broadCatalog=await requestCatalog(client,subject,null,academicContext?.program?.id,academicContext?.grade);
      const clarifiedCourse=course?.id||matchCourseClarification(userText,broadCatalog.courses);
      if(clarifiedCourse){
        const clarifiedCatalog=await requestCatalog(client,subject,clarifiedCourse,academicContext?.program?.id,academicContext?.grade);
        resolution=await resolveLearningRequest(llm,{text:pendingClarification,subjectId:subject,explicitCourse:clarifiedCourse,target:lesson.target,catalog:clarifiedCatalog,recentContext:userText});
      }else{
        resolution=await resolveLearningRequest(llm,{text:`${pendingClarification}\nУточнение ученика к выбору курса: ${userText}`,subjectId:subject,target:lesson.target,catalog:broadCatalog,recentContext:history.slice(-2).map(h=>h.text).join('\n')});
      }
      resumedClarification=true;
    }
    if(client&&!resumedClarification&&!reuse&&!(sttConfidence!=null&&sttConfidence<.65)){
      const catalog=await requestCatalog(client,subject,course?.id||null,academicContext?.program?.id,academicContext?.grade);
      resolution=await resolveLearningRequest(llm,{text:userText,subjectId:subject,explicitCourse:course?.id||null,target:lesson.target,catalog,recentContext:history.slice(-2).map(h=>h.text).join('\n')});
    }
    if(!resolution.needsClarification&&resolution.turnKind!=='new_goal'&&resolution.courseId===lesson.target.courseId){resolution={...resolution,curriculumUnitId:resolution.curriculumUnitId??lesson.target.curriculumUnitId,skillId:resolution.skillId??lesson.target.skillId};}
    if(resolution.courseId){course=resolveCourse(subject,resolution.courseId);
      if(client&&academicContext){academicContext=await getActiveLearningContext(body.childId,subject,resolution.courseId,new SupabaseCurriculumRepository(client));academicPrompt=renderAcademicContext(academicContext);}}
    const selectedCatalog=client&&resolution.courseId?await requestCatalog(client,subject,resolution.courseId,academicContext?.program?.id,academicContext?.grade):null;
    if(selectedCatalog&&!(sttConfidence!=null&&sttConfidence<.65))resolution=validateResolution(resolution,subject,selectedCatalog,courseId);
    const candidates=selectedCatalog?.skills||[];
    const analysisInput = { text:userText,subjectId:subject,courseId:resolution.courseId,sttConfidence,
      previousTask:lesson.lastTask?.text||history.filter(item=>item.role==='assistant').at(-1)?.text,candidates };
    const analysis = resolution.turnKind==='learner_attempt' ? await analyzeLearnerTurn(llm,analysisInput) : unknownAnalysis(analysisInput,sttConfidence!=null&&sttConfidence<.65?'stt_uncertain':'non_attempt');
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
      subjectId: subject, courseId: course?.id || null, skillIds: [...new Set([resolution.skillId,...analysis.skillIds].filter((id):id is string=>!!id))], intent: client ? resolution.requestedActions[0] || "unknown" : learningPlan.intent,
      taskGeneration: client ? resolution.explicitConstraints.wantsFreshTask || resolution.requestedActions.includes("practice") : learningPlan.taskGeneration, modality: ["text","voice","image"].includes(body.inputModality) ? body.inputModality : imageDataUrl ? "image" : "text",
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null });
    let skillStatus:string|undefined;
    if(client&&academicContext&&resolution.skillId){const result=await client.from('student_skill_state').select('status,independent_successes,hinted_successes,failures,last_seen_at').eq('child_id',academicContext.child.id).eq('skill_id',resolution.skillId).maybeSingle();skillStatus=result.data?.status;}
    const decision=planPedagogy({request:resolution,state:lesson,analysis,skillStatus,rules:applicableRules,sttConfidence});
    const skillSignal=skillStatus||'not_seen';
    if(client)supportStage=decision.supportStage;
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
${client ? JSON.stringify(decision) : renderLearningPlan(learningPlan)}

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

    const execution = client ? `You execute the deterministic pedagogy decision below. It overrides legacy mode/intent suggestions. Do not choose course, skill, phase, help level or correctness. Execute actions in order. Explanation belongs in answer; every fresh UNSOLVED exercise belongs ONLY in taskBlock {prompt,skillId:null}. At stage 0 taskBlock contains no hint, worked step or solution. Do not repeat the existing task when a fresh one is required. Use the selected teachingMethod. Preserve Russian support for English beginners. Do not infer mastery or show technical IDs/reason codes to the learner. If clarification or transcript confirmation is planned, ask that short question only. Learner analysis (read-only): ${JSON.stringify({correctness:analysis.correctness,errorClasses:analysis.errorClasses,uncertaintyReason:analysis.uncertaintyReason})}. Target title: ${candidates.find(s=>s.id===decision.target.skillId)?.title||"not catalogued"}. Current task: ${JSON.stringify(lesson.lastTask)}. Request: ${JSON.stringify(resolution)}. Decision: ${JSON.stringify(decision)}. Output JSON with answer, taskBlock (or null), visualBlock, visualLabel, teachingMethod, topic, previousMethodOutcome, previousMethodEvidence. Learner grade ${learner.grade}; ${subjectPrompt}; ${renderParentRules(applicableRules)}.` : pedagogy;
    const messages = [
      {
        role: "system",
        text:
          buildTutorInstructions(subject, mode, learner) +
          "\n\n" + academicPrompt +
          "\n\n" +
          execution,
      },
      ...history.map((item) => ({
        role: item.role,
        text: item.text,
      })),
      { role: "user", text: userText },
    ];

    const criticContext = { grade: learner.grade, courseId: course?.id || null, stage: supportStage, sourceText: history.map(item=>item.text).join("\n") + "\n" + userText,
      decision: client ? decision : undefined, requestResolution: client ? resolution : undefined, lastTask: lesson.lastTask?.text, taskGeneration: client ? decision.shouldGenerateTask : learningPlan.taskGeneration, wantsVisual: client ? decision.responseConstraints.requireVisual : learningPlan.visualType !== "none", english: subject === "english",
      mustChangeMethod: client ? decision.actions.includes("change_representation") : learningPlan.mustChangeMethod, previousMethod, analysis, rules: client && decision.actions.some(a=>["clarify_target","confirm_transcript"].includes(a)) ? [] : applicableRules };
    const accepted = await acceptResponse(async flags => {
      const candidateMessages = flags ? messages.map((item,index)=> index === 0 ? { ...item, text: item.text + "\nRepair these response violations without changing the learner analysis: " + flags.join(",") } : item) : messages;
      if(client&&decision.actions.includes('clarify_target'))return parseModelJson(JSON.stringify({answer:resolution.clarificationQuestion||'Какую тему разбираем?',teachingMethod:decision.teachingMethod}));
      if(client&&decision.actions.includes('confirm_transcript'))return parseModelJson(JSON.stringify({answer:'Проверь распознанный текст: это именно то, что ты хотела сказать?',teachingMethod:decision.teachingMethod}));
      const result=parseModelJson(await llm.generate({ messages: candidateMessages, temperature: flags ? .2 : .35, maxTokens: 1300 }));
      return client ? {...result,hintLevel:decision.supportStage,taskBlock:result.taskBlock?{...result.taskBlock,skillId:decision.target.skillId}:null}:result;
    }, criticContext, client && decision.actions.some(a=>["clarify_target","confirm_transcript"].includes(a)) ? undefined : llm);
    const parsed = { ...accepted.result, ...(client?{teachingMethod:decision.teachingMethod,hintLevel:decision.supportStage}:{}), correctness: analysis.correctness, needsReview: false };
    // Existing explicit hint requests may advance help without becoming a knowledge error.
    // Technical/analyzer uncertainty never advances the ladder; management turns remain unchanged.
    const technicalUncertainty = ["stt_uncertain","analyzer_unavailable","invalid_analysis","low_confidence","missing_evidence"].includes(analysis.uncertaintyReason || "");
    const nextSupportStage = client ? decision.supportStage : technicalUncertainty ? supportStage : computeNextSupportStage({
      currentStage: supportStage, message: userText, correctness: analysis.correctness });
    if (client && academicContext && typeof body.sessionId === "string") {
      try { const evidenceClient = client, childId = academicContext.child.id;
        await withFailover(signal => recordAcceptedEvidence(evidenceClient, { childId, sessionId: body.sessionId,
        turnId: typeof body.turnId === "string" ? body.turnId : crypto.randomUUID(), analysis, supportStage: lesson.supportStage, sttConfidence, signal }), undefined, 3000); }
      catch { console.error("evidence_write_unavailable"); }
    }
    if(client&&academicContext&&sessionId){
      const originalClarificationRequest=lesson.pendingClarification?.originalRequestText||userText;
      lesson=acceptedState(lesson,decision,parsed.taskBlock);
      if(decision.actions.includes("clarify_target")){
        lesson.pendingClarification={originalRequestText:originalClarificationRequest.slice(0,3000)};
      }else{
        lesson.pendingClarification=null;
      }
      if(decision.shouldGenerateTask&&!parsed.taskBlock){lesson.phase="clarify";lesson.expectedLearnerAction="clarify";}
      await persistLesson(client,sessionId,academicContext.child.id,lesson);
    }
    return Response.json({
      ...parsed,
      lessonState:client?lesson:null,
      requestResolution:client?resolution:null,
      pedagogyDecision:client?decision:null,
      analysisMetadata: { confidence: analysis.confidence, source: "universal_analyzer", errorClasses: analysis.errorClasses, criticFlags: accepted.flags, evidenceEligible: analysis.learningEvidenceEligible, evidence: analysis.evidenceSummary },
      intent: client ? resolution.requestedActions[0] || 'unknown' : learningPlan.intent,
      goal: learningPlan.goal,
      visualType: client ? decision.responseConstraints.requireVisual ? "diagram" : "none" : learningPlan.visualType,
      requestedFormat: learningPlan.format,
      methodChangeRequired: client ? decision.actions.includes("change_representation") : learningPlan.mustChangeMethod,
      supportStageUsed: supportStage,
      nextSupportStage,
      recognizedImageText: imageText || null,
    });
  } catch {
    return Response.json({ error: "Не удалось получить ответ репетитора." }, { status: 500 });
  }
}
