"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("Проверяем ссылку восстановления...");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function prepareRecoverySession() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          url.searchParams.delete("code");
          window.history.replaceState({}, "", url.pathname);
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (session) {
          setReady(true);
          setMessage("");
        } else {
          setMessage(
            "Ссылка восстановления недействительна или истекла. Вернитесь на страницу входа и запросите новое письмо."
          );
        }
      } catch (error) {
        if (!active) return;
        setMessage(
          error instanceof Error
            ? error.message
            : "Не удалось проверить ссылку восстановления."
        );
      }
    }

    prepareRecoverySession();

    return () => {
      active = false;
    };
  }, [supabase.auth]);

  async function updatePassword(event: FormEvent) {
    event.preventDefault();

    if (password.length < 6) {
      setMessage("Новый пароль должен содержать не менее 6 символов.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Пароли не совпадают.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMessage("Пароль обновлён. Сейчас можно войти с новым паролем.");
      setReady(false);

      window.setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось обновить пароль."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8ff] grid place-items-center p-5">
      <div className="w-full max-w-md rounded-[30px] bg-white p-7 shadow-lg">
        <p className="text-sm font-semibold text-violet-500">AI-репетитор</p>
        <h1 className="text-3xl font-bold mt-1">Новый пароль</h1>

        {ready && (
          <form onSubmit={updatePassword} className="space-y-4 mt-6">
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Новый пароль"
              autoComplete="new-password"
              className="w-full rounded-2xl border border-violet-100 px-4 py-3 outline-none focus:border-violet-400"
            />

            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Повторите пароль"
              autoComplete="new-password"
              className="w-full rounded-2xl border border-violet-100 px-4 py-3 outline-none focus:border-violet-400"
            />

            <button
              disabled={loading}
              className="w-full rounded-2xl bg-violet-600 py-3 font-bold text-white disabled:opacity-50"
            >
              {loading ? "Сохраняем..." : "Сохранить новый пароль"}
            </button>
          </form>
        )}

        {message && (
          <div className="mt-5 rounded-2xl bg-violet-50 p-3 text-sm text-slate-600">
            {message}
          </div>
        )}

        {!ready && (
          <a
            href="/login"
            className="mt-5 inline-block text-sm font-semibold text-violet-700"
          >
            Вернуться ко входу
          </a>
        )}
      </div>
    </main>
  );
}
