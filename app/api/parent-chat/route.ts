export const runtime = "nodejs";

function requireEnv() {
  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;

  if (!apiKey) throw new Error("YANDEX_API_KEY не найден в .env.local");
  if (!folderId) throw new Error("YANDEX_FOLDER_ID не найден в .env.local");

  return { apiKey, folderId };
}

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
    const { apiKey, folderId } = requireEnv();
    const body = await request.json();

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";
    const childName =
      typeof body.childName === "string"
        ? body.childName
        : "Софья";

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
Ты — Луник, AI-репетитор. Сейчас ты разговариваешь С РОДИТЕЛЕМ ребёнка ${childName}.

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
- Если метод имеет меньше 2 наблюдений, называй это только ранним наблюдением.
- Если метод проверен 2+ раза, можно говорить о предварительной тенденции.
- Уверенный вывод требует нескольких занятий и повторяющегося результата.
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
            temperature: 0.2,
            maxTokens: "1000",
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
          "Не удалось получить ответ родительского помощника."
      );
    }

    const raw =
      data?.result?.alternatives?.[0]?.message?.text?.trim() || "";

    return Response.json(parseJson(raw));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось получить ответ.",
      },
      { status: 500 }
    );
  }
}
