"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Session = {
  id: string;
  subject: string;
  mode: string;
  title: string | null;
  independence_score: number | null;
  hints_used: number;
  started_at: string;
  updated_at: string;
};

type TopicProgress = {
  topic: string;
  mastery_score: number | null;
  needs_review: boolean;
  last_seen_at: string;
};

const SUBJECTS = {
  math: {
    name: "Математика",
    subtitle: "Логика везде",
    description: "Разбираемся в формулах, закономерностях и задачах шаг за шагом.",
    image: "/images/math.png",
    icon: "📐",
  },
  russian: {
    name: "Русский язык",
    subtitle: "Слова создают миры",
    description: "Учимся видеть закономерности языка и объяснять правила на примерах.",
    image: "/images/russian.png",
    icon: "✍️",
  },
  english: {
    name: "Английский язык",
    subtitle: "Больше, чем просто слова",
    description: "Учимся понимать английскую речь, грамматику и использовать язык на практике.",
    image: "/images/english.png",
    icon: "💬",
  },
  geography: {
    name: "География",
    subtitle: "Весь мир — твой",
    description: "Связываем места, природу, климат и жизнь людей.",
    image: "/images/geography.png",
    icon: "🌍",
  },
  physics: {
    name: "Физика",
    subtitle: "Как устроен этот удивительный мир?",
    description: "Понимаем явления через наблюдения, эксперименты и задачи.",
    image: "/images/physics.png",
    icon: "⚛️",
  },
  literature: {
    name: "Литература",
    subtitle: "Истории, которые остаются",
    description: "Разбираем героев, конфликты, смыслы и учимся выражать своё мнение.",
    image: "/images/literature.png",
    icon: "📚",
  },
  biology: {
    name: "Биология",
    subtitle: "Жизнь во всех её формах",
    description: "Понимаем строение и процессы через схемы, связи и сравнения.",
    image: "/images/biology.png",
    icon: "🌿",
  },
  history: {
    name: "История",
    subtitle: "Люди. События. Идеи.",
    description: "Понимаем события через причины, последствия и истории людей.",
    image: "/images/history.png",
    icon: "🏛️",
  },
} as const;

const MODES = [
  { key: "topic", icon: "▥", title: "Разобрать тему", text: "Понятное объяснение темы шаг за шагом" },
  { key: "problem", icon: "⚡", title: "Решить задачу", text: "Ищем решение вместе, не получаем готовый ответ" },
  { key: "homework", icon: "✓", title: "Домашнее задание", text: "Текст, фотография или голосовое сообщение" },
  { key: "test", icon: "🎯", title: "Подготовка к контрольной", text: "Повторяем темы и проверяем знания" },
  { key: "practice", icon: "✦", title: "Тренировка", text: "Задания с постепенной адаптацией сложности" },
  { key: "weak", icon: "↻", title: "Повторить слабые темы", text: "Возвращаемся к реальным ошибкам и закрепляем материал" },
] as const;

export default function SubjectPage() {
  const params = useParams();
  const subjectKey = String(params.subject || "") as keyof typeof SUBJECTS;
  const subject = SUBJECTS[subjectKey];
  const supabase = createClient();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [topics, setTopics] = useState<TopicProgress[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, [subjectKey]);

  async function load() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSignedIn(false);
      setLoading(false);
      return;
    }

    setSignedIn(true);

    const { data: child } = await supabase
      .from("children")
      .select("id")
      .eq("parent_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!child) {
      setLoading(false);
      return;
    }

    const [sessionsResult, topicsResult] = await Promise.all([
      supabase
        .from("study_sessions")
        .select("id,subject,mode,title,independence_score,hints_used,started_at,updated_at")
        .eq("child_id", child.id)
        .eq("subject", subjectKey)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("topic_progress")
        .select("topic,mastery_score,needs_review,last_seen_at")
        .eq("child_id", child.id)
        .eq("subject", subjectKey)
        .order("last_seen_at", { ascending: false })
        .limit(20),
    ]);

    setSessions((sessionsResult.data || []) as Session[]);
    setTopics((topicsResult.data || []) as TopicProgress[]);
    setLoading(false);
  }

  const currentTopic = topics[0] || null;
  const reviewTopics = topics.filter((item) => item.needs_review).slice(0, 3);
  const recentSessions = sessions.slice(0, 3);

  const averageIndependence = useMemo(() => {
    const values = sessions
      .map((item) => item.independence_score)
      .filter((value): value is number => typeof value === "number");

    if (!values.length) return null;

    return Math.round(
      values.reduce((sum, value) => sum + value, 0) / values.length
    );
  }, [sessions]);

  if (!subject) {
    return (
      <main className="min-h-screen grid place-items-center bg-[#f7f8ff]">
        <div className="rounded-3xl bg-white p-8 shadow">Предмет не найден.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8ff] text-slate-900">
      <div className="max-w-[1450px] mx-auto p-4 md:p-6">
        <header className="flex items-center justify-between gap-3 mb-4">
          <a
            href="/"
            className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm"
          >
            ← На главную
          </a>

          <div className="flex items-center gap-3">
            <a
              href="/parent"
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm"
            >
              Родителю
            </a>
            <div className="h-10 w-10 rounded-full bg-violet-600 text-white grid place-items-center font-bold">
              С
            </div>
            <span className="font-semibold">Софья</span>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-[30px] min-h-[250px] shadow-lg">
          <Image
            src={subject.image}
            alt=""
            fill
            priority
            sizes="(min-width: 1450px) 1450px, 100vw"
            quality={60}
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#14164f]/95 via-[#2b2768]/70 to-[#1d1645]/15" />

          <div className="relative z-10 p-7 md:p-9 text-white max-w-[760px]">
            <p className="inline-flex rounded-xl bg-white/15 px-3 py-2 text-sm">
              {subject.icon} {subject.name} · 7 класс
            </p>
            <h1 className="text-4xl md:text-5xl font-bold mt-4">{subject.name}</h1>
            <p className="text-lg text-violet-100 mt-2">{subject.subtitle}</p>
            <p className="max-w-[650px] text-sm md:text-base text-white/85 mt-4">
              {subject.description}
            </p>

            <div className="mt-5 inline-flex rounded-2xl bg-white/90 px-4 py-3 text-slate-900">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-violet-500">
                  Реальный прогресс
                </p>
                <p className="font-bold">
                  {averageIndependence === null
                    ? "Пока недостаточно данных"
                    : `Самостоятельность ${averageIndependence}%`}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5">
          <h2 className="text-2xl font-bold">Что будем делать?</h2>
          <p className="text-sm text-slate-500 mt-1">
            Выбери режим — Луник подстроит занятие под задачу и историю обучения.
          </p>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
            {MODES.map((mode) => (
              <a
                key={mode.key}
                href={`/subject/${subjectKey}/${mode.key}`}
                className="rounded-[24px] bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
              >
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-violet-100 text-violet-700 grid place-items-center text-xl">
                    {mode.icon}
                  </div>
                  <div>
                    <h3 className="font-bold">{mode.title}</h3>
                    <p className="text-sm text-slate-500 mt-1">{mode.text}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="grid xl:grid-cols-3 gap-4 mt-5">
          <div className="rounded-[26px] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Сейчас изучаем</h2>
              <span className="text-xs text-violet-500">по реальным данным</span>
            </div>

            {loading ? (
              <p className="text-sm text-slate-400 mt-5">Загружаю...</p>
            ) : currentTopic ? (
              <div className="mt-4 rounded-2xl bg-violet-50 p-4">
                <p className="font-bold">{currentTopic.topic}</p>
                <p className="text-sm text-slate-500 mt-1">
                  Последняя тема, с которой работала Софья.
                </p>
                <div className="mt-4 h-2 rounded-full bg-violet-100 overflow-hidden">
                  <div
                    className="h-full bg-violet-500"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, currentTopic.mastery_score ?? 0)
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {currentTopic.mastery_score === null
                    ? "Оценка ещё не сформирована"
                    : `${currentTopic.mastery_score}% по текущим наблюдениям`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400 mt-5">
                {signedIn
                  ? "Пока недостаточно данных. Начните занятие по этому предмету."
                  : "Войдите, чтобы видеть реальный прогресс."}
              </p>
            )}
          </div>

          <div className="rounded-[26px] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">Стоит повторить</h2>

            {reviewTopics.length ? (
              <div className="space-y-3 mt-4">
                {reviewTopics.map((item) => (
                  <a
                    key={item.topic}
                    href={`/subject/${subjectKey}/weak`}
                    className="block rounded-2xl bg-amber-50 p-4 hover:bg-amber-100/70 transition"
                  >
                    <p className="font-semibold">{item.topic}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Отмечено по результатам реальных занятий
                    </p>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 mt-5">
                Пока нет подтверждённых слабых тем.
              </p>
            )}
          </div>

          <div className="rounded-[26px] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">Последние занятия</h2>

            {recentSessions.length ? (
              <div className="space-y-3 mt-4">
                {recentSessions.map((item) => (
                  <a
                    key={item.id}
                    href={`/subject/${subjectKey}/${item.mode}`}
                    className="block rounded-2xl border border-violet-100 p-4 hover:bg-violet-50/40 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold line-clamp-1">
                        {item.title || "Занятие"}
                      </p>
                      <span className="text-[11px] text-slate-400">
                        {new Date(item.started_at).toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                    <p className="text-xs text-violet-500 mt-2">
                      Продолжить режим →
                    </p>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 mt-5">
                Занятий по этому предмету пока нет.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
