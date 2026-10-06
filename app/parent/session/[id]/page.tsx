"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  created_at: string;
};

type Session = {
  id: string;
  subject: string;
  mode: string;
  title: string | null;
  started_at: string;
  independence_score: number | null;
  hints_used: number;
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

export default function ParentSessionPage() {
  const params = useParams();
  const sessionId = String(params.id || "");
  const supabase = createClient();

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, [sessionId]);

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from("study_sessions")
      .select(
        "id,subject,mode,title,started_at,independence_score,hints_used"
      )
      .eq("id", sessionId)
      .single();

    if (sessionError) {
      setError(sessionError.message);
      return;
    }

    const { data: messageData, error: messageError } = await supabase
      .from("messages")
      .select("id,role,text,created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (messageError) {
      setError(messageError.message);
      return;
    }

    setSession(sessionData as Session);
    setMessages((messageData || []) as Message[]);
  }

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center bg-[#f7f8ff]">
        <div className="rounded-3xl bg-white p-7 shadow">
          <p className="text-red-600">{error}</p>
          <a href="/parent" className="text-violet-700 text-sm font-semibold">
            ← Назад
          </a>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen grid place-items-center bg-[#f7f8ff]">
        <p className="text-violet-700">Загружаю занятие...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8ff] p-5 md:p-7">
      <div className="max-w-[1000px] mx-auto">
        <a
          href="/parent"
          className="inline-flex rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm mb-4"
        >
          ← Родительский кабинет
        </a>

        <div className="flex justify-end mb-3">
          <a
            href={`/subject/${session.subject}/${session.mode}`}
            className="rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow"
          >
            Продолжить занятие →
          </a>
        </div>

        <section className="rounded-[28px] bg-gradient-to-r from-[#24235e] to-[#6752c8] text-white p-6 mb-4">
          <p className="text-sm text-violet-200">
            {SUBJECT_NAMES[session.subject] || session.subject}
          </p>
          <h1 className="text-2xl font-bold mt-1">
            {session.title || session.mode}
          </h1>
          <div className="flex flex-wrap gap-4 text-xs text-violet-100 mt-3">
            <span>
              {new Date(session.started_at).toLocaleString("ru-RU")}
            </span>
            <span>
              Самостоятельность:{" "}
              {session.independence_score === null
                ? "—"
                : `${session.independence_score}%`}
            </span>
            <span>Подсказок: {session.hints_used}</span>
          </div>
        </section>

        <section className="rounded-[28px] bg-white p-5 md:p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">Диалог занятия</h2>

          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                    message.role === "user"
                      ? "bg-violet-600 text-white"
                      : "bg-violet-50 text-slate-800"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
