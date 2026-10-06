"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  SUBJECTS,
  STUDY_MODES,
  type SubjectSlug,
  type StudyModeSlug,
} from "@/lib/tutor-config";
import { createClient } from "@/lib/supabase/client";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  visualBlock?: string | null;
  teachingMethod?: string | null;
  supportStage?: number;
};

type MethodSummary = {
  method: string;
  attempts: number;
  avgOutcome: number;
};

type TutorResult = {
  answer: string;
  visualBlock: string | null;
  visualLabel: string | null;
  teachingMethod: string;
  previousMethodOutcome: number | null;
  previousMethodEvidence: string;
  topic: string;
  hintLevel: number;
  independenceScore: number;
  correctness: "correct" | "incorrect" | "partial" | "unknown";
  needsReview: boolean;
  intent?: string;
  goal?: string;
  visualType?: string;
  topicEvidence?: string;
  supportStageUsed: number;
  nextSupportStage: number;
};

type VoiceSettings = {
  enabled: boolean;
  speed: number;
  preset: "calm" | "warm";
  englishSpeed: number;
};

const DEFAULT_VOICE: VoiceSettings = {
  enabled: false,
  speed: 1,
  preset: "calm",
  englishSpeed: 0.9,
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      offset,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true
    );
    offset += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

function mergeAndDownsample(
  chunks: Float32Array[],
  inputSampleRate: number,
  outputSampleRate = 16000
) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const input = new Float32Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    input.set(chunk, offset);
    offset += chunk.length;
  }

  if (inputSampleRate === outputSampleRate) return input;

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * ratio;
    const index = Math.floor(sourceIndex);
    const nextIndex = Math.min(index + 1, input.length - 1);
    const fraction = sourceIndex - index;
    output[i] =
      input[index] * (1 - fraction) +
      input[nextIndex] * fraction;
  }

  return output;
}

export default function StudyModePage() {
  const params = useParams();
  const supabase = createClient();

  const subjectKey = params.subject as SubjectSlug;
  const modeKey = params.mode as StudyModeSlug;
  const currentSubject = SUBJECTS[subjectKey];
  const currentMode = STUDY_MODES[modeKey];

  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [userId, setUserId] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [parentRules, setParentRules] = useState<string[]>([]);
  const [methodProfile, setMethodProfile] = useState<MethodSummary[]>([]);
  const [previousMethod, setPreviousMethod] = useState<string | null>(null);
  const [supportStage, setSupportStage] = useState(0);
  const [voiceSettings, setVoiceSettings] =
    useState<VoiceSettings>(DEFAULT_VOICE);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);
  const recordStartedAtRef = useRef(0);

  const [replyAudioUrl, setReplyAudioUrl] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void initializePersistence();
  }, [subjectKey, modeKey]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function ensureChild(parentId: string) {
    const { data: existing, error: selectError } = await supabase
      .from("children")
      .select("id,name,grade,voice_settings")
      .eq("parent_id", parentId)
      .limit(1)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) return existing;

    const { data: created, error: insertError } = await supabase
      .from("children")
      .insert({
        parent_id: parentId,
        name: "Софья",
        grade: 7,
        voice_settings: DEFAULT_VOICE,
      })
      .select("id,name,grade,voice_settings")
      .single();

    if (insertError) throw insertError;
    return created;
  }

  async function loadMethodProfile(currentChildId: string) {
    const { data } = await supabase
      .from("learning_method_events")
      .select("method,outcome_score")
      .eq("child_id", currentChildId)
      .eq("subject", subjectKey)
      .not("outcome_score", "is", null)
      .order("created_at", { ascending: false })
      .limit(80);

    const grouped = new Map<string, number[]>();

    for (const item of data || []) {
      if (typeof item.outcome_score !== "number") continue;
      const values = grouped.get(item.method) || [];
      values.push(item.outcome_score);
      grouped.set(item.method, values);
    }

    const profile = [...grouped.entries()].map(([method, values]) => ({
      method,
      attempts: values.length,
      avgOutcome:
        values.reduce((sum, value) => sum + value, 0) / values.length,
    }));

    setMethodProfile(profile);
  }

  async function initializePersistence() {
    setError("");
    setNotice("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUserId(null);
      setChildId(null);
      setNotice("Занятие работает, но история сохранится только после входа родителя.");
      return;
    }

    setUserId(user.id);

    try {
      const child = await ensureChild(user.id);
      setChildId(child.id);
      await loadMethodProfile(child.id);

      if (child.voice_settings) {
        setVoiceSettings({
          ...DEFAULT_VOICE,
          ...(child.voice_settings as VoiceSettings),
        });
      }

      const { data: rules } = await supabase
        .from("tutor_rules")
        .select("rule_text")
        .eq("parent_id", user.id)
        .eq("active", true)
        .or(`child_id.is.null,child_id.eq.${child.id}`)
        .order("created_at", { ascending: true });

      setParentRules((rules || []).map((item) => item.rule_text));

      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: recentSession } = await supabase
        .from("study_sessions")
        .select("id,last_activity_at")
        .eq("child_id", child.id)
        .eq("subject", subjectKey)
        .eq("mode", modeKey)
        .eq("status", "active")
        .gte("last_activity_at", cutoff)
        .order("last_activity_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!recentSession) {
        setActiveSessionId(null);
        setMessages([]);
        return;
      }

      const { data: storedMessages, error: messageError } = await supabase
        .from("messages")
        .select("role,text,metadata,created_at")
        .eq("session_id", recentSession.id)
        .order("created_at", { ascending: true });

      if (messageError) throw messageError;

      setActiveSessionId(recentSession.id);

      const restored = (storedMessages || []).map((item) => {
        const metadata =
          item.metadata && typeof item.metadata === "object"
            ? (item.metadata as Record<string, unknown>)
            : {};

        return {
          role: item.role as "user" | "assistant",
          text: item.text,
          visualBlock:
            typeof metadata.visualBlock === "string"
              ? metadata.visualBlock
              : null,
          teachingMethod:
            typeof metadata.teachingMethod === "string"
              ? metadata.teachingMethod
              : null,
          supportStage:
            typeof metadata.supportStage === "number"
              ? metadata.supportStage
              : 0,
        };
      });

      setMessages(restored);

      const lastAssistant = [...restored]
        .reverse()
        .find((item) => item.role === "assistant" && item.teachingMethod);

      setPreviousMethod(lastAssistant?.teachingMethod || null);
      setSupportStage(lastAssistant?.supportStage || 0);

      if ((storedMessages || []).length) {
        setNotice("Продолжаем последнее занятие. История восстановлена.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Не удалось восстановить историю: ${err.message}`
          : "Не удалось восстановить историю."
      );
    }
  }

  async function startNewSession() {
    if (activeSessionId) {
      await supabase
        .from("study_sessions")
        .update({ status: "completed" })
        .eq("id", activeSessionId);
    }

    setActiveSessionId(null);
    setMessages([]);
    setPreviousMethod(null);
    setSupportStage(0);
    setNotice("Новое занятие начато.");
  }

  function handleImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function transcribeAudio(blob: Blob) {
    setIsTranscribing(true);
    setError("");

    try {
      const form = new FormData();
      form.append(
        "audio",
        new File([blob], "voice.wav", { type: "audio/wav" })
      );
      form.append("lang", subjectKey === "english" ? "en-US" : "ru-RU");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Не удалось распознать голос.");
      }

      if (data.text) {
        setText((previous) =>
          previous.trim()
            ? `${previous.trim()}\n${data.text}`
            : data.text
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось распознать голосовое сообщение."
      );
    } finally {
      setIsTranscribing(false);
    }
  }

  async function startRecording() {
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error("Браузер не поддерживает запись аудио.");
      }

      const context = new AudioContextClass();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);

      recordedChunksRef.current = [];
      recordStartedAtRef.current = Date.now();

      processor.onaudioprocess = (event) => {
        if (!recordStartedAtRef.current) return;

        recordedChunksRef.current.push(
          new Float32Array(event.inputBuffer.getChannelData(0))
        );

        if (Date.now() - recordStartedAtRef.current >= 25000) {
          void stopRecording();
        }
      };

      source.connect(processor);
      processor.connect(context.destination);

      audioContextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
      streamRef.current = stream;
      setIsRecording(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось получить доступ к микрофону."
      );
    }
  }

  async function stopRecording() {
    if (!recordStartedAtRef.current) return;

    setIsRecording(false);

    const context = audioContextRef.current;
    const inputSampleRate = context?.sampleRate || 48000;

    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    if (context) await context.close();

    const samples = mergeAndDownsample(
      recordedChunksRef.current,
      inputSampleRate,
      16000
    );

    const wavBlob = encodeWav(samples, 16000);

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(wavBlob));

    recordStartedAtRef.current = 0;
    recordedChunksRef.current = [];

    await transcribeAudio(wavBlob);
  }

  async function speakAnswer(answer: string) {
    try {
      const speed =
        subjectKey === "english"
          ? voiceSettings.englishSpeed
          : voiceSettings.speed;

      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: answer,
          subject: subjectKey,
          speed,
          preset: voiceSettings.preset,
        }),
      });

      if (!response.ok) return;

      const blob = await response.blob();

      if (replyAudioUrl) URL.revokeObjectURL(replyAudioUrl);
      const url = URL.createObjectURL(blob);
      setReplyAudioUrl(url);

      const audio = new Audio(url);
      await audio.play().catch(() => {});
    } catch {
      // Голос не должен ломать текстовый ответ.
    }
  }

  async function saveVoiceSettings(next: VoiceSettings) {
    setVoiceSettings(next);
    if (!childId) return;

    await supabase
      .from("children")
      .update({ voice_settings: next })
      .eq("id", childId);
  }

  async function saveExchange(
    sessionId: string,
    userText: string,
    result: TutorResult
  ) {
    if (!childId) return;

    const { error: messageError } = await supabase
      .from("messages")
      .insert([
        {
          session_id: sessionId,
          role: "user",
          text: userText,
          metadata: {},
        },
        {
          session_id: sessionId,
          role: "assistant",
          text: result.answer,
          metadata: {
            hintLevel: result.hintLevel,
            topic: result.topic,
            correctness: result.correctness,
            visualBlock: result.visualBlock,
            visualLabel: result.visualLabel,
            teachingMethod: result.teachingMethod,
            intent: result.intent || null,
            goal: result.goal || null,
            visualType: result.visualType || "none",
            supportStage: result.nextSupportStage,
          },
        },
      ]);

    if (messageError) throw messageError;

    if (
      previousMethod &&
      typeof result.previousMethodOutcome === "number"
    ) {
      const score = Math.max(
        0,
        Math.min(100, Math.round(result.previousMethodOutcome))
      );

      const outcomeLabel =
        score >= 80
          ? "helped"
          : score >= 55
          ? "mixed"
          : "not_helped";

      await supabase.from("learning_method_events").insert({
        child_id: childId,
        session_id: sessionId,
        subject: subjectKey,
        topic: result.topic || null,
        method: previousMethod,
        outcome_score: score,
        outcome_label: outcomeLabel,
        evidence: result.previousMethodEvidence || null,
      });
    }

    await supabase.from("turn_analytics").insert({
      session_id: sessionId,
      child_id: childId,
      subject: subjectKey,
      topic: result.topic || null,
      hint_level: result.hintLevel,
      independence_score: result.independenceScore,
      correctness: result.correctness,
      needs_review: result.needsReview,
    });

    await supabase.from("learning_observations").insert({
      child_id: childId,
      session_id: sessionId,
      subject: subjectKey,
      topic: result.topic || null,
      intent: result.intent || "unknown",
      goal: result.goal || "Учебная цель пока уточняется",
      method: result.teachingMethod,
      visual_type: result.visualType || "none",
      support_stage: result.supportStageUsed,
      evidence: result.topicEvidence || null,
    });

    const { data: analytics } = await supabase
      .from("turn_analytics")
      .select("hint_level,independence_score")
      .eq("session_id", sessionId);

    const values = (analytics || [])
      .map((x) => x.independence_score)
      .filter((x): x is number => typeof x === "number");

    const avg =
      values.length > 0
        ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        : null;

    const hints = (analytics || []).reduce(
      (sum, x) => sum + (Number(x.hint_level) > 0 ? 1 : 0),
      0
    );

    await supabase
      .from("study_sessions")
      .update({
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        independence_score: avg,
        hints_used: hints,
      })
      .eq("id", sessionId);

    if (result.topic) {
      await supabase.from("topic_progress").upsert(
        {
          child_id: childId,
          subject: subjectKey,
          topic: result.topic,
          mastery_score: result.independenceScore,
          needs_review: result.needsReview,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "child_id,subject,topic" }
      );
    }

    setPreviousMethod(result.teachingMethod);
    await loadMethodProfile(childId);
  }

  async function sendMessage() {
    const cleanText = text.trim();

    if (!cleanText && !imageFile) {
      setError(
        "Напиши сообщение, прикрепи фото или запиши голосовое сообщение."
      );
      return;
    }

    setIsSending(true);
    setError("");
    setNotice("");

    try {
      const imageDataUrl = imageFile
        ? await fileToDataUrl(imageFile)
        : null;

      const userText =
        cleanText ||
        "Я прикрепила изображение. Помоги мне разобраться с заданием.";

      const history = messages.slice(-16);

      setMessages((previous) => [
        ...previous,
        { role: "user", text: userText },
      ]);

      setText("");
      removeImage();

      let sessionId = activeSessionId;

      if (userId && childId && !sessionId) {
        const { data: session, error: sessionError } = await supabase
          .from("study_sessions")
          .insert({
            child_id: childId,
            subject: subjectKey,
            mode: modeKey,
            title: userText.slice(0, 140),
            status: "active",
            last_activity_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (sessionError) throw sessionError;

        sessionId = session.id;
        setActiveSessionId(session.id);
      }

      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subjectKey,
          mode: modeKey,
          message: userText,
          imageDataUrl,
          history,
          parentRules,
          methodProfile,
          previousMethod,
          supportStage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Луник пока не смог ответить.");
      }

      const result: TutorResult = {
        answer: String(data.answer || ""),
        visualBlock:
          typeof data.visualBlock === "string" && data.visualBlock.trim()
            ? data.visualBlock
            : null,
        visualLabel:
          typeof data.visualLabel === "string" && data.visualLabel.trim()
            ? data.visualLabel
            : null,
        teachingMethod: String(data.teachingMethod || "dialogue"),
        previousMethodOutcome:
          typeof data.previousMethodOutcome === "number"
            ? data.previousMethodOutcome
            : null,
        previousMethodEvidence: String(
          data.previousMethodEvidence || ""
        ),
        topic: String(data.topic || ""),
        hintLevel: Number(data.hintLevel || 0),
        independenceScore: Number(data.independenceScore ?? 70),
        correctness: data.correctness || "unknown",
        needsReview: Boolean(data.needsReview),
        intent: typeof data.intent === "string" ? data.intent : "unknown",
        goal: typeof data.goal === "string" ? data.goal : "",
        visualType:
          typeof data.visualType === "string" ? data.visualType : "none",
        topicEvidence:
          typeof data.topicEvidence === "string" ? data.topicEvidence : "",
        supportStageUsed: Number(data.supportStageUsed ?? supportStage),
        nextSupportStage: Number(data.nextSupportStage ?? supportStage),
      };

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: result.answer,
          visualBlock: result.visualBlock,
          teachingMethod: result.teachingMethod,
          supportStage: result.nextSupportStage,
        },
      ]);

      setSupportStage(result.nextSupportStage);

      if (sessionId) {
        await saveExchange(sessionId, userText, result);
      }

      if (voiceSettings.enabled) {
        await speakAnswer(result.answer);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось отправить сообщение Лунику."
      );
    } finally {
      setIsSending(false);
    }
  }

  if (!currentSubject || !currentMode) {
    return (
      <main className="min-h-screen grid place-items-center bg-[#f7f8ff]">
        <div className="rounded-3xl bg-white p-8 shadow">Раздел не найден.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8ff] text-slate-900">
      <div className="max-w-[1300px] mx-auto p-4 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex flex-wrap gap-2">
            <a
              href="/"
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm"
            >
              ← Главная
            </a>

            <a
              href={`/subject/${subjectKey}`}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm"
            >
              ← {currentSubject.name}
            </a>
          </div>

          <div className="flex gap-2">
            <button
              onClick={startNewSession}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm"
            >
              + Новое занятие
            </button>
            <a
              href="/parent"
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm"
            >
              Родителю
            </a>
          </div>
        </header>

        <section className="rounded-[30px] bg-gradient-to-r from-[#24235e] to-[#6752c8] text-white p-6 md:p-8 shadow-lg mb-5">
          <p className="text-sm text-violet-200 mb-2">
            {currentSubject.icon} {currentSubject.name} · 7 класс
          </p>
          <div className="flex items-center gap-3">
            <div className="text-3xl">{currentMode.icon}</div>
            <h1 className="text-3xl md:text-4xl font-bold">
              {currentMode.title}
            </h1>
          </div>
        </section>

        {notice && (
          <div className="mb-4 rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-700">
            {notice}
          </div>
        )}

        <div className="grid xl:grid-cols-[1.45fr_0.55fr] gap-4">
          <section className="rounded-[28px] bg-white shadow-sm p-5 md:p-6">
            <div className="sticky top-2 z-30 flex justify-end mb-2 pointer-events-none">
              <button
                onClick={startNewSession}
                className="pointer-events-auto rounded-xl bg-white/95 border border-violet-100 px-4 py-2 text-xs font-bold text-violet-700 shadow-md hover:bg-violet-50"
              >
                ＋ Новое занятие
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div
                className="h-12 w-12 rounded-2xl bg-cover bg-no-repeat ring-2 ring-violet-100"
                style={{
                  backgroundImage: "url('/images/lunik-hero-final.png')",
                  backgroundSize: "340%",
                  backgroundPosition: "83% 42%",
                }}
              />
              <div>
                <p className="font-bold text-lg">Луник</p>
                <p className="text-xs text-slate-400">
                  Помогаю понять, а не просто получить ответ
                </p>
              </div>
            </div>

            <div className="rounded-[22px] bg-violet-50 p-4 mb-4">
              <p className="text-sm">Привет, Софья! 🌙</p>
              <p className="font-semibold mt-1">{currentMode.question}</p>
            </div>

            {messages.length > 0 && (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 mb-4">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex ${
                      message.role === "user"
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-[20px] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                        message.role === "user"
                          ? "bg-violet-600 text-white"
                          : "bg-violet-50 text-slate-800"
                      }`}
                    >
                      <div>{message.text}</div>

                      {message.role === "assistant" &&
                        message.visualBlock && (
                          <pre className="mt-3 overflow-x-auto rounded-2xl border border-violet-200 bg-white px-4 py-3 font-mono text-[15px] leading-7 text-slate-900 whitespace-pre">
                            {message.visualBlock}
                          </pre>
                        )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}

            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  if (!isSending && !isTranscribing) {
                    void sendMessage();
                  }
                }
              }}
              placeholder={currentMode.placeholder}
              className="w-full min-h-[150px] resize-none rounded-[22px] border border-violet-100 bg-[#fafaff] p-5 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
            />
            <p className="mt-1 px-2 text-[11px] text-slate-400">
              Enter — отправить · Shift + Enter — новая строка
            </p>

            {imagePreview && (
              <div className="mt-4 rounded-[22px] border border-violet-100 bg-violet-50/40 p-3">
                <div className="flex justify-between mb-2">
                  <p className="text-sm font-semibold">Прикреплённое изображение</p>
                  <button onClick={removeImage} className="text-xs text-red-500">
                    Удалить
                  </button>
                </div>
                <img
                  src={imagePreview}
                  alt="Прикреплённое задание"
                  className="max-h-[280px] rounded-2xl object-contain"
                />
              </div>
            )}

            {audioUrl && (
              <div className="mt-4 rounded-[22px] bg-violet-50 p-4">
                <p className="text-xs text-slate-500 mb-2">
                  {isTranscribing
                    ? "Распознаю голос..."
                    : "Голосовое распознано и добавлено в сообщение."}
                </p>
                <audio controls src={audioUrl} className="w-full" />
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImage}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-100"
              >
                📷 Прикрепить фото
              </button>

              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={isTranscribing}
                  className="rounded-2xl bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                >
                  🎤 Записать голосовое
                </button>
              ) : (
                <button
                  onClick={() => void stopRecording()}
                  className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 animate-pulse"
                >
                  ⏹ Остановить запись
                </button>
              )}

              <button
                onClick={sendMessage}
                disabled={isSending || isTranscribing}
                className="ml-auto rounded-2xl bg-violet-600 px-6 py-3 text-sm font-bold text-white shadow hover:bg-violet-700 disabled:opacity-50"
              >
                {isSending ? "Луник думает..." : "Отправить Лунику →"}
              </button>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-[26px] bg-white p-5 shadow-sm">
              <h2 className="font-bold text-lg mb-3">Голос Луника</h2>

              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Озвучивать ответы</span>
                <input
                  type="checkbox"
                  checked={voiceSettings.enabled}
                  onChange={(event) =>
                    void saveVoiceSettings({
                      ...voiceSettings,
                      enabled: event.target.checked,
                    })
                  }
                />
              </label>

              <label className="block text-xs text-slate-500 mt-4 mb-1">
                Характер голоса
              </label>
              <select
                value={voiceSettings.preset}
                onChange={(event) =>
                  void saveVoiceSettings({
                    ...voiceSettings,
                    preset: event.target.value as "calm" | "warm",
                  })
                }
                className="w-full rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 text-sm outline-none"
              >
                <option value="calm">Спокойный</option>
                <option value="warm">Доброжелательный</option>
              </select>

              <label className="block text-xs text-slate-500 mt-4 mb-1">
                Скорость речи
              </label>
              <select
                value={
                  subjectKey === "english"
                    ? voiceSettings.englishSpeed
                    : voiceSettings.speed
                }
                onChange={(event) => {
                  const speed = Number(event.target.value);

                  void saveVoiceSettings(
                    subjectKey === "english"
                      ? { ...voiceSettings, englishSpeed: speed }
                      : { ...voiceSettings, speed }
                  );
                }}
                className="w-full rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 text-sm outline-none"
              >
                <option value={0.8}>Медленно</option>
                <option value={0.9}>Учебная</option>
                <option value={1}>Обычно</option>
                <option value={1.1}>Быстрее</option>
              </select>

              {subjectKey === "english" && (
                <p className="text-xs leading-relaxed text-slate-400 mt-3">
                  Для английского сохраняется отдельная учебная скорость.
                </p>
              )}

              {replyAudioUrl && (
                <audio controls src={replyAudioUrl} className="w-full mt-4" />
              )}
            </section>

            <section className="rounded-[26px] bg-gradient-to-br from-violet-50 to-blue-50 p-5">
              <p className="font-semibold mb-2">Как работает Луник 💜</p>
              <p className="text-xs leading-relaxed text-slate-500">
                Помощь идёт по ступеням: самопроверка → маленькая подсказка →
                конкретная подсказка → один шаг вместе → полный разбор.
              </p>
              <p className="mt-3 text-xs font-semibold text-violet-600">
                Текущая ступень помощи: {supportStage} из 4
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
