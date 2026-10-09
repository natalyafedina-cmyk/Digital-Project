"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Session = {
  id: string;
  started_at: string;
  independence_score: number | null;
};

type Topic = {
  topic: string;
  subject: string;
  needs_review: boolean;
  mastery_score: number | null;
};

export default function HomeInsights() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setSignedIn(true);

    const { data: child } = await supabase
      .from("children")
      .select("id")
      .eq("parent_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!child) return;

    const [{ data: sessionData }, { data: topicData }] = await Promise.all([
      supabase
        .from("study_sessions")
        .select("id,started_at,independence_score")
        .eq("child_id", child.id)
        .order("started_at", { ascending: false })
        .limit(100),
      supabase
        .from("topic_progress")
        .select("topic,subject,needs_review,mastery_score")
        .eq("child_id", child.id)
        .eq("needs_review", true)
        .order("last_seen_at", { ascending: false })
        .limit(3),
    ]);

    setSessions((sessionData || []) as Session[]);
    setTopics((topicData || []) as Topic[]);
  }

  const weekCount = useMemo(() => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return sessions.filter(
      (item) => new Date(item.started_at).getTime() >= since
    ).length;
  }, [sessions]);

  const independence = useMemo(() => {
    const values = sessions
      .map((x) => x.independence_score)
      .filter((x): x is number => typeof x === "number");
    if (!values.length) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }, [sessions]);

  const streak = useMemo(() => {
    const days = new Set(
      sessions.map((s) => new Date(s.started_at).toISOString().slice(0, 10))
    );

    let count = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      if (!days.has(key)) break;
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return count;
  }, [sessions]);

  if (!signedIn) {
    return (
      <section className="relative z-30 hidden xl:grid shrink-0 h-[88px] mt-2 grid-cols-[1.05fr_1.35fr_1fr] gap-2">
        <Link href="/login" className="bg-white/90 rounded-[18px] shadow-sm px-4 py-2.5 flex items-center">
          <div>
            <p className="text-sm font-bold mb-1">Твой прогресс</p>
            <p className="text-[9px] text-slate-400">Войди, чтобы видеть реальные данные</p>
          </div>
        </Link>
        <div className="bg-white/90 rounded-[18px] shadow-sm px-4 py-2.5">
          <p className="text-sm font-bold mb-1">Что повторить</p>
          <p className="text-[9px] text-slate-400">Появится после занятий</p>
        </div>
        <div className="bg-white/90 rounded-[18px] shadow-sm px-4 py-2.5">
          <p className="text-sm font-bold">🔥 0 дней</p>
          <p className="text-[9px] text-slate-400">серия занятий</p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative z-30 hidden xl:grid shrink-0 h-[88px] mt-2 grid-cols-[1.05fr_1.35fr_1fr] gap-2">
      <Link
        href="/section/achievements"
        className="relative z-40 bg-white/90 rounded-[18px] shadow-sm px-4 py-2.5 flex items-center gap-3 hover:shadow-md transition cursor-pointer"
      >
        <div>
          <p className="text-sm font-bold mb-1">Твой прогресс</p>
          <p className="text-[9px] text-slate-400">{weekCount} занятий за 7 дней</p>
        </div>
        <div className="ml-auto">
          <div className="h-[52px] w-[52px] rounded-full border-[6px] border-violet-200 flex items-center justify-center text-[12px] font-bold">
            {independence === null ? "—" : `${independence}%`}
          </div>
        </div>
      </Link>

      <Link
        href="/section/goals"
        className="relative z-40 bg-white/90 rounded-[18px] shadow-sm px-4 py-2.5 hover:shadow-md transition cursor-pointer"
      >
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-sm font-bold">Что повторить</p>
          <span className="text-[9px] text-violet-500">Прогресс →</span>
        </div>
        <div className="space-y-1 text-[9px] text-slate-600">
          {topics.length ? (
            topics.slice(0, 2).map((item) => (
              <div key={`${item.subject}-${item.topic}`}>□ {item.topic}</div>
            ))
          ) : (
            <div>Пока нет слабых тем ✨</div>
          )}
        </div>
      </Link>

      <Link
        href="/section/achievements"
        className="relative z-40 bg-white/90 rounded-[18px] shadow-sm px-4 py-2.5 hover:shadow-md transition cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">🔥</span>
          <div>
            <p className="text-sm font-bold">{streak} дней</p>
            <p className="text-[9px] text-slate-400">реальная серия занятий</p>
          </div>
        </div>
      </Link>
    </section>
  );
}
