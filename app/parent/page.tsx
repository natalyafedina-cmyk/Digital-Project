"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  METHOD_LABELS,
  type TeachingMethod,
} from "@/lib/adaptive-learning";

type Session = {
  id: string;
  subject: string;
  mode: string;
  title: string | null;
  started_at: string;
  hints_used: number;
  independence_score: number | null;
};

type Rule = {
  id: string;
  rule_text: string;
  scope: "permanent" | "temporary";
  active: boolean;
  category?: string;
  subject?: string | null;
  priority?: number;
};

type MethodEvent = {
  method: string;
  outcome_score: number | null;
  subject: string;
};

type TopicProgress = {
  subject: string;
  topic: string;
  mastery_score: number | null;
  needs_review: boolean;
};

type ParentMessage = {
  role: "user" | "assistant";
  text: string;
};

const SUBJECT_NAMES: Record<string, string> = {
  math: "Математика",
  russian: "Русский язык",
  english: "Английский язык",
  geography: "География",
  physics: "Физика",
  literature: "Литература",
  biology: "Биология",
  history: "История",
};

export default function ParentPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [childName, setChildName] = useState("Софья");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [methodEvents, setMethodEvents] = useState<MethodEvent[]>([]);
  const [topicProgress, setTopicProgress] = useState<TopicProgress[]>([]);
  const [chat, setChat] = useState<ParentMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [suggestedRule, setSuggestedRule] = useState<{
    text: string;
    scope: "permanent" | "temporary";
    action: "add" | "replace";
    targetRuleId: string | null;
    category: string;
    subject: string | null;
  } | null>(null);
  const [newRule, setNewRule] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function ensureChild(userId: string) {
    const { data: existing, error: selectError } = await supabase
      .from("children")
      .select("id,name,grade")
      .eq("parent_id", userId)
      .limit(1)
      .maybeSingle();

    if (selectError) throw selectError;
    if (existing) return existing;

    const { data: created, error: insertError } = await supabase
      .from("children")
      .insert({ parent_id: userId, name: "Софья", grade: 7 })
      .select("id,name,grade")
      .single();

    if (insertError) throw insertError;
    return created;
  }

  async function load() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const child = await ensureChild(user.id);
      setChildId(child.id);
      setChildName(child.name);

      const [
        sessionsRes,
        rulesRes,
        chatRes,
        methodsRes,
        topicsRes,
      ] = await Promise.all([
        supabase
          .from("study_sessions")
          .select(
            "id,subject,mode,title,started_at,hints_used,independence_score"
          )
          .eq("child_id", child.id)
          .order("started_at", { ascending: false })
          .limit(100),
        supabase
          .from("tutor_rules")
          .select(
            "id,rule_text,scope,active,category,subject,priority"
          )
          .eq("parent_id", user.id)
          .eq("active", true)
          .or(`child_id.is.null,child_id.eq.${child.id}`)
          .order("created_at", { ascending: false }),
        supabase
          .from("parent_chat_messages")
          .select("role,text")
          .eq("parent_id", user.id)
          .order("created_at", { ascending: true })
          .limit(50),
        supabase
          .from("learning_method_events")
          .select("method,outcome_score,subject")
          .eq("child_id", child.id)
          .not("outcome_score", "is", null)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("topic_progress")
          .select("subject,topic,mastery_score,needs_review")
          .eq("child_id", child.id)
          .order("last_seen_at", { ascending: false })
          .limit(100),
      ]);

      if (sessionsRes.error) throw sessionsRes.error;
      if (rulesRes.error) throw rulesRes.error;
      if (chatRes.error) throw chatRes.error;
      if (methodsRes.error) throw methodsRes.error;
      if (topicsRes.error) throw topicsRes.error;

      setSessions((sessionsRes.data || []) as Session[]);
      setRules((rulesRes.data || []) as Rule[]);
      setMethodEvents((methodsRes.data || []) as MethodEvent[]);
      setTopicProgress((topicsRes.data || []) as TopicProgress[]);
      setChat(
        (chatRes.data || []).map((item) => ({
          role: item.role as "user" | "assistant",
          text: item.text,
        }))
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить данные."
      );
    } finally {
      setLoading(false);
    }
  }

  async function addRule(
    text: string,
    scope: "permanent" | "temporary" = "permanent",
    meta?: {
      category?: string;
      subject?: string | null;
      priority?: number;
    }
  ) {
    const clean = text.trim();
    if (!clean || !childId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error: insertError } = await supabase
      .from("tutor_rules")
      .insert({
        parent_id: user.id,
        child_id: childId,
        rule_text: clean,
        scope,
        active: true,
        category: meta?.category || "general",
        subject: meta?.subject || null,
        priority: meta?.priority ?? 50,
      })
      .select(
        "id,rule_text,scope,active,category,subject,priority"
      )
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setRules((previous) => [data as Rule, ...previous]);
    setNewRule("");
    setSuggestedRule(null);
  }

  async function disableRule(id: string) {
    await supabase
      .from("tutor_rules")
      .update({ active: false })
      .eq("id", id);

    setRules((previous) => previous.filter((rule) => rule.id !== id));
  }

  async function applySuggestedRule() {
    if (!suggestedRule) return;

    if (
      suggestedRule.action === "replace" &&
      suggestedRule.targetRuleId
    ) {
      await disableRule(suggestedRule.targetRuleId);
    }

    await addRule(
      suggestedRule.text,
      suggestedRule.scope,
      {
        category: suggestedRule.category,
        subject: suggestedRule.subject,
      }
    );

    setSuggestedRule(null);
  }

  async function sendParentChat() {
    const clean = chatText.trim();
    if (!clean || chatLoading || !childId) return;

    setChatLoading(true);
    setError("");
    setSuggestedRule(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const userMessage: ParentMessage = { role: "user", text: clean };
      const previousChat = chat.slice(-16);

      setChat((previous) => [...previous, userMessage]);
      setChatText("");

      await supabase.from("parent_chat_messages").insert({
        parent_id: user.id,
        child_id: childId,
        role: "user",
        text: clean,
      });

      const response = await fetch("/api/parent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          childName,
          activeRules: rules.map((rule) => ({
            id: rule.id,
            text: rule.rule_text,
            category: rule.category || "general",
            subject: rule.subject || null,
          })),
          evidence: evidenceSummary,
          history: previousChat,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Не удалось получить ответ.");
      }

      const assistantText = String(data.answer || "");
      setChat((previous) => [
        ...previous,
        { role: "assistant", text: assistantText },
      ]);

      await supabase.from("parent_chat_messages").insert({
        parent_id: user.id,
        child_id: childId,
        role: "assistant",
        text: assistantText,
        metadata: {
          suggestedRule: data.suggestedRule || null,
          scope: data.scope || "permanent",
        },
      });

      if (data.suggestedRule) {
        setSuggestedRule({
          text: String(data.suggestedRule),
          scope:
            data.scope === "temporary"
              ? "temporary"
              : "permanent",
          action:
            data.ruleAction === "replace"
              ? "replace"
              : "add",
          targetRuleId:
            typeof data.targetRuleId === "string"
              ? data.targetRuleId
              : null,
          category:
            typeof data.category === "string"
              ? data.category
              : "general",
          subject:
            typeof data.subject === "string"
              ? data.subject
              : null,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось получить ответ."
      );
    } finally {
      setChatLoading(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const last7Days = useMemo(() => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return sessions.filter(
      (item) => new Date(item.started_at).getTime() >= since
    );
  }, [sessions]);

  const bySubject = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of sessions) {
      map.set(item.subject, (map.get(item.subject) || 0) + 1);
    }
    return [...map.entries()]
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count);
  }, [sessions]);

  const averageIndependence = useMemo(() => {
    const values = sessions
      .map((item) => item.independence_score)
      .filter((value): value is number => typeof value === "number");

    if (!values.length) return null;

    return Math.round(
      values.reduce((sum, value) => sum + value, 0) / values.length
    );
  }, [sessions]);

  const methodStats = useMemo(() => {
    const grouped = new Map<string, number[]>();

    for (const item of methodEvents) {
      if (typeof item.outcome_score !== "number") continue;
      const values = grouped.get(item.method) || [];
      values.push(item.outcome_score);
      grouped.set(item.method, values);
    }

    return [...grouped.entries()]
      .map(([method, values]) => ({
        method,
        attempts: values.length,
        avg: Math.round(
          values.reduce((sum, value) => sum + value, 0) / values.length
        ),
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [methodEvents]);

  const weakTopics = useMemo(
    () =>
      topicProgress
        .filter((item) => item.needs_review)
        .slice(0, 8),
    [topicProgress]
  );

  const evidenceSummary = useMemo(
    () => ({
      sessionsCount: sessions.length,
      averageIndependence,
      subjects: bySubject.map((item) => ({
        subject: item.subject,
        sessions: item.count,
      })),
      weakTopics: weakTopics.map((item) => ({
        subject: item.subject,
        topic: item.topic,
        mastery: item.mastery_score,
      })),
      methodStats: methodStats.map((item) => ({
        method: item.method,
        attempts: item.attempts,
        averageOutcome: item.avg,
      })),
      dataConfidence:
        sessions.length >= 5 && methodEvents.length >= 6
          ? "enough_for_initial_patterns"
          : sessions.length >= 2
          ? "early"
          : "insufficient",
    }),
    [
      sessions.length,
      averageIndependence,
      bySubject,
      weakTopics,
      methodStats,
      methodEvents.length,
    ]
  );

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-[#f7f8ff]">
        <p className="text-violet-700 font-semibold">
          Загружаю родительский кабинет...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8ff] text-slate-900">
      <div className="max-w-[1400px] mx-auto p-5 md:p-7">
        <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <p className="text-sm text-violet-500 font-semibold">
              Родительский кабинет
            </p>
            <h1 className="text-3xl md:text-4xl font-bold mt-1">
              Прогресс: {childName}
            </h1>
          </div>

          <div className="flex gap-2">
            <a
              href="/"
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm"
            >
              ← К занятиям
            </a>
            <button
              onClick={logout}
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-500 shadow-sm"
            >
              Выйти
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <section className="grid md:grid-cols-4 gap-3 mb-5">
          {[
            [String(last7Days.length), "занятий за неделю"],
            [String(bySubject.length), "предметов в работе"],
            [
              averageIndependence === null
                ? "—"
                : `${averageIndependence}%`,
              "самостоятельность",
            ],
            [String(sessions.length), "занятий сохранено"],
          ].map(([value, label]) => (
            <div key={label} className="rounded-[24px] bg-white p-5 shadow-sm">
              <p className="text-3xl font-bold text-violet-700">{value}</p>
              <p className="text-sm text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </section>

        <section className="grid xl:grid-cols-[0.9fr_1.1fr] gap-4 mb-4">
          <div className="rounded-[28px] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4">
              Последние занятия
            </h2>

            {sessions.length === 0 ? (
              <p className="text-sm text-slate-400">
                Проведите первое занятие — оно появится здесь автоматически.
              </p>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {sessions.slice(0, 10).map((item) => (
                  <a
                    key={item.id}
                    href={`/parent/session/${item.id}`}
                    className="block rounded-2xl border border-violet-100 p-4 hover:bg-violet-50/50 transition"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">
                        {SUBJECT_NAMES[item.subject] || item.subject}
                      </p>
                      <span className="text-xs text-slate-400">
                        {new Date(item.started_at).toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                      {item.title || item.mode}
                    </p>
                    <p className="text-xs text-violet-500 mt-2">
                      Открыть диалог →
                    </p>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[28px] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-semibold text-violet-500">
                  Обсудить обучение
                </p>
                <h2 className="text-xl font-bold">
                  Чат родителя с Луником
                </h2>
              </div>
            </div>

            <div className="h-[290px] overflow-y-auto rounded-2xl bg-[#fafaff] p-4 space-y-3">
              {chat.length === 0 && (
                <p className="text-sm text-slate-400">
                  Здесь можно обсуждать занятия как с реальным репетитором:
                  например, попросить чаще хвалить за самостоятельность или
                  медленнее вести английский.
                </p>
              )}

              {chat.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${
                    message.role === "user"
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                      message.role === "user"
                        ? "bg-violet-600 text-white"
                        : "bg-white border border-violet-100"
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
            </div>

            {suggestedRule && (
              <div className="mt-3 rounded-2xl bg-violet-50 p-4">
                <p className="text-xs font-semibold text-violet-500">
                  Луник предлагает сохранить правило
                </p>
                <p className="text-sm mt-1">{suggestedRule.text}</p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => void applySuggestedRule()}
                    className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white"
                  >
                    {suggestedRule.action === "replace"
                      ? "Заменить правило"
                      : "Сохранить правило"}
                  </button>
                  <button
                    onClick={() => setSuggestedRule(null)}
                    className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-500"
                  >
                    Не сохранять
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <textarea
                value={chatText}
                onChange={(event) => setChatText(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    if (!chatLoading) {
                      void sendParentChat();
                    }
                  }
                }}
                placeholder="Например: сначала дай Софье ещё одну попытку, прежде чем подсказывать"
                className="flex-1 min-h-[90px] resize-none rounded-2xl border border-violet-100 p-3 text-sm outline-none focus:border-violet-400"
              />
              <button
                onClick={sendParentChat}
                disabled={chatLoading}
                className="self-end rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {chatLoading ? "Думаю..." : "Отправить"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] bg-gradient-to-br from-[#302a78] to-[#6b54ca] p-6 text-white shadow-sm mb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-violet-200 font-semibold">
                Адаптивная аналитика
              </p>
              <h2 className="text-2xl font-bold mt-1">
                Как Софье сейчас легче учиться
              </h2>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
              {evidenceSummary.dataConfidence === "enough_for_initial_patterns"
                ? "Есть первые устойчивые наблюдения"
                : evidenceSummary.dataConfidence === "early"
                ? "Пока только ранние наблюдения"
                : "Данных пока недостаточно"}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3 mt-5">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-sm font-bold">Лучше срабатывает</p>
              {methodStats.filter((item) => item.attempts >= 2).length ? (
                <div className="space-y-2 mt-3 text-sm">
                  {methodStats
                    .filter((item) => item.attempts >= 2)
                    .slice(0, 3)
                    .map((item) => (
                      <div key={item.method}>
                        {METHOD_LABELS[
                          item.method as TeachingMethod
                        ] || item.method}: {item.avg}/100
                        <span className="text-violet-200">
                          {" "}({item.attempts} наблюд.)
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-violet-200 mt-3">
                  Нужно ещё несколько занятий, чтобы сравнивать методы.
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-sm font-bold">Стоит повторить</p>
              {weakTopics.length ? (
                <div className="space-y-2 mt-3 text-sm">
                  {weakTopics.slice(0, 3).map((item) => (
                    <div key={`${item.subject}-${item.topic}`}>
                      {SUBJECT_NAMES[item.subject] || item.subject}: {item.topic}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-violet-200 mt-3">
                  Подтверждённых слабых тем пока нет.
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-sm font-bold">Как Луник адаптируется</p>
              <p className="text-sm text-violet-100 mt-3 leading-relaxed">
                Если один способ объяснения не помогает, следующий ответ должен
                использовать другой метод. Вывод о предпочтении закрепляется
                только после нескольких наблюдений.
              </p>
            </div>
          </div>
        </section>

        <section className="grid xl:grid-cols-[1fr_1fr] gap-4">
          <div className="rounded-[28px] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4">
              Активность по предметам
            </h2>

            {bySubject.length === 0 ? (
              <p className="text-sm text-slate-400">
                Пока нет сохранённых занятий.
              </p>
            ) : (
              <div className="space-y-3">
                {bySubject.map((item) => (
                  <div
                    key={item.subject}
                    className="flex items-center justify-between rounded-2xl bg-violet-50 px-4 py-3"
                  >
                    <span className="font-semibold">
                      {SUBJECT_NAMES[item.subject] || item.subject}
                    </span>
                    <span className="text-violet-700 font-bold">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[28px] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-2">
              Правила для репетитора
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Они дополняют базовые педагогические правила, но не отключают
              лестницу помощи и безопасность.
            </p>

            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {rules.length === 0 && (
                <p className="text-sm text-slate-400">
                  Дополнительных правил пока нет.
                </p>
              )}

              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-start gap-3 rounded-2xl bg-violet-50 p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm">{rule.rule_text}</p>
                    <p className="text-[11px] text-violet-500 mt-1">
                      {rule.scope === "temporary"
                        ? "временное"
                        : "постоянное"}
                    </p>
                  </div>
                  <button
                    onClick={() => void disableRule(rule.id)}
                    className="text-xs text-red-500"
                  >
                    Убрать
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <input
                value={newRule}
                onChange={(event) => setNewRule(event.target.value)}
                placeholder="Добавить правило вручную"
                className="flex-1 rounded-2xl border border-violet-100 px-4 py-3 text-sm outline-none"
              />
              <button
                onClick={() => void addRule(newRule)}
                className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white"
              >
                Добавить
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
