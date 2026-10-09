"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("Наталья");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        });

        if (error) throw error;

        setMessage(
          "Аккаунт создан. Если Supabase попросит подтверждение email — подтвердите письмо, затем войдите."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        window.location.href = "/parent";
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось выполнить вход."
      );
    } finally {
      setLoading(false);
    }
  }

  async function recoverPassword() {
    if (!email) {
      setMessage("Сначала введите email, для которого нужно восстановить пароль.");
      return;
    }

    setRecoveryLoading(true);
    setMessage("");

    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) throw error;

      setMessage(
        "Письмо для восстановления пароля отправлено. Откройте его и перейдите по ссылке."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось отправить письмо для восстановления пароля."
      );
    } finally {
      setRecoveryLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8ff] grid place-items-center p-5">
      <div className="w-full max-w-md rounded-[30px] bg-white p-7 shadow-lg">
        <p className="text-sm font-semibold text-violet-500">AI-репетитор</p>

        <h1 className="text-3xl font-bold mt-1">
          {mode === "login" ? "Вход родителя" : "Регистрация родителя"}
        </h1>

        <form onSubmit={submit} className="space-y-4 mt-6">
          {mode === "signup" && (
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Имя"
              className="w-full rounded-2xl border border-violet-100 px-4 py-3 outline-none focus:border-violet-400"
            />
          )}

          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="w-full rounded-2xl border border-violet-100 px-4 py-3 outline-none focus:border-violet-400"
          />

          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Пароль"
            className="w-full rounded-2xl border border-violet-100 px-4 py-3 outline-none focus:border-violet-400"
          />

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-violet-600 py-3 font-bold text-white disabled:opacity-50"
          >
            {loading
              ? "Подождите..."
              : mode === "login"
              ? "Войти"
              : "Создать аккаунт"}
          </button>
        </form>

        {mode === "login" && (
          <button
            type="button"
            onClick={recoverPassword}
            disabled={recoveryLoading}
            className="mt-3 text-sm font-semibold text-violet-700 disabled:opacity-50"
          >
            {recoveryLoading ? "Отправляем письмо..." : "Забыли пароль?"}
          </button>
        )}

        {message && (
          <div className="mt-4 rounded-2xl bg-violet-50 p-3 text-sm text-slate-600">
            {message}
          </div>
        )}

        <button
          onClick={() =>
            setMode((current) =>
              current === "login" ? "signup" : "login"
            )
          }
          className="mt-5 text-sm font-semibold text-violet-700"
        >
          {mode === "login"
            ? "Нет аккаунта? Зарегистрироваться"
            : "Уже есть аккаунт? Войти"}
        </button>
      </div>
    </main>
  );
}
