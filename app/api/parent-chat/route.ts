import { interpretParentRule } from "@/lib/parent-rule-engine";
import { createLLMProvider } from "@/lib/providers";
import { learnerConfig } from "@/lib/learner-config";
import {
  buildEvidenceOnlyParentAnalysis,
  getParentDataConfidence,
} from "@/lib/parent-analytics";

export const runtime = "nodejs";


function parseJson(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    const parsed = JSON.parse(cleaned);

    return {
      answer:
        typeof parsed.answer === "string"
          ? parsed.answer
          : raw,
      suggestedRule:
        typeof parsed.suggestedRule === "string" &&
        parsed.suggestedRule.trim()
          ? parsed.suggestedRule.trim()
          : null,
      scope:
        parsed.scope === "temporary"
          ? "temporary"
          : "permanent",
      ruleAction:
        parsed.ruleAction === "replace"
          ? "replace"
          : parsed.ruleAction === "add"
          ? "add"
          : "none",
      targetRuleId:
        typeof parsed.targetRuleId === "string" &&
        parsed.targetRuleId.trim()
          ? parsed.targetRuleId
          : null,
      category:
        typeof parsed.category === "string"
          ? parsed.category
          : "general",
      subject:
        typeof parsed.subject === "string" &&
        parsed.subject.trim()
          ? parsed.subject
          : null,
    };
  } catch {
    return {
      answer: raw,
      suggestedRule: null,
      scope: "permanent",
      ruleAction: "none",
      targetRuleId: null,
      category: "general",
      subject: null,
    };
  }
}

export async function POST(request: Request) {
  try {
    const llm = createLLMProvider();
    const body = await request.json();

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";
    const childName =
      typeof body.childName === "string"
        ? body.childName
        : learnerConfig.displayName;

    const activeRules = Array.isArray(body.activeRules)
      ? body.activeRules.slice(0, 30)
      : [];

    const evidence =
      body.evidence && typeof body.evidence === "object"
        ? body.evidence
        : {};

    const history = Array.isArray(body.history)
      ? body.history.slice(-16)
      : [];

    if (!message) {
      return Response.json(
        { error: "Напишите сообщение." },
        { status: 400 }
      );
    }

    const system = `
Ты — ${learnerConfig.tutorName}, AI-репетитор. Сейчас ты разговариваешь С РОДИТЕЛЕМ ребёнка ${childName}.

ВАЖНЕЙШЕЕ ПРАВИЛО:
Ты можешь делать выводы о прогрессе, слабых темах и подходящих методиках ТОЛЬКО по переданным ниже данным.
Нельзя придумывать:
- интерес ребёнка;
- мотивацию;
- "сильные стороны";
- улучшение результата;
- эффективность правила;
если этого нет в данных.

Если данных мало — прямо скажи: "Пока данных недостаточно для уверенного вывода" и объясни, что именно нужно накопить.

РЕАЛЬНЫЕ ДАННЫЕ:
${JSON.stringify(evidence, null, 2)}

АКТИВНЫЕ ПРАВИЛА РОДИТЕЛЯ:
${JSON.stringify(activeRules, null, 2)}

КАК ОБСУЖДАТЬ МЕТОДИКУ:
- Если метод имеет меньше 5 наблюдений, НЕ сравнивай его эффективность с другими методами.
- Предварительное сравнение методов допустимо только если хотя бы два разных метода имеют по 5+ наблюдений.
- Даже при достаточном количестве событий это только предварительный учебный паттерн, а не характеристика личности ребёнка.
- Нельзя выводить интерес, мотивацию, способности или "сильные стороны" из числа занятий, технических баллов, частоты ответов или одного успешного примера.
- Если в данных нет прямого подтверждения интереса или мотивации, не употребляй формулировки "проявляет интерес", "мотивирована", "успешно справляется", "сильная сторона".
- Не называй числовую метрику "оценкой ребёнка". Это технический сигнал для адаптации.
- Если правило родителя похоже на метод, который стабильно не помогает, можно предложить изменить правило.
- Не отключай и не меняй правило самостоятельно.
- Замена правила возможна только после подтверждения родителем.
- Если текущих данных недостаточно, не предлагай убрать правило только из-за отсутствия прогресса.

Когда родитель просит новое правило:
- сформулируй его конкретно и без лишней жёсткости;
- предложи сохранить;
- не превращай каждое сообщение в правило.

Когда действительно есть основания заменить существующее правило:
- ruleAction = "replace";
- targetRuleId = id правила из ACTIVE RULES;
- suggestedRule = новая формулировка.
Иначе ruleAction = "add" или "none".

КАТЕГОРИИ:
pedagogy, motivation, format, voice, subject, general.

НУЖЕН СТРОГО JSON БЕЗ MARKDOWN:
{
  "answer": "ответ родителю",
  "suggestedRule": "",
  "scope": "permanent|temporary",
  "ruleAction": "none|add|replace",
  "targetRuleId": null,
  "category": "general",
  "subject": null
}
`;

    const messages = [
      { role: "system", text: system },
      ...history.map((item: any) => ({
        role:
          item.role === "assistant"
            ? "assistant"
            : "user",
        text: String(item.text || ""),
      })),
      { role: "user", text: message },
    ];

    const raw = await llm.generate({ messages, temperature: 0.2, maxTokens: 1000 });

    const parsed = parseJson(raw);
    const confidence = getParentDataConfidence(evidence);
    const asksForAnalysis =
      /анализ|прогресс|как\s+заним|сильн|слаб|что\s+получа|как\s+учится/i.test(
        message
      );
    const containsUnsupportedTraitClaim =
      /проявля(?:ет|ла)\s+интерес|мотивир|сильн(?:ая|ые)\s+сторон|успешно\s+справ/i.test(
        parsed.answer
      );

    if (
      (asksForAnalysis && confidence !== "enough_for_initial_patterns") ||
      containsUnsupportedTraitClaim
    ) {
      return Response.json({
        ...parsed,
        answer: buildEvidenceOnlyParentAnalysis(childName, evidence),
        suggestedRule: null,
        ruleAction: "none",
        targetRuleId: null,
      });
    }

    if (parsed.suggestedRule) {
      try {
        const interpretation = await interpretParentRule(llm, parsed.suggestedRule);
        if (interpretation.needsClarification) return Response.json({ ...parsed, suggestedRule: null, needsClarification: true, clarificationQuestion: interpretation.clarificationQuestion,
          answer: parsed.answer + " " + interpretation.clarificationQuestion });
        return Response.json({ ...parsed, structuredRule: interpretation.rule });
      } catch { return Response.json({ ...parsed, suggestedRule: null, answer: parsed.answer + " Формулировку правила нужно проверить перед сохранением." }); }
    }
    return Response.json(parsed);
  } catch {
    return Response.json({ error: "Не удалось получить ответ родительского помощника." }, { status: 500 });
  }
}
