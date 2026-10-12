import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createLLMProvider, createSTTProvider, createTTSProvider, createVisionProvider, withFailover } from "@/lib/providers";
import { speakWithBrowser } from "@/lib/browser-speech";
import { POST as speech } from "@/app/api/speech/route";
import { POST as tutor } from "@/app/api/tutor/route";
const env = { YANDEX_API_KEY: "test-key", YANDEX_FOLDER_ID: "test-folder" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("provider configuration", () => {
  it("selects all four Yandex adapters and preserves wire formats", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ result: { alternatives: [{ message: { text: "answer" } }] } }))
      .mockResolvedValueOnce(Response.json({ result: "voice" }))
      .mockResolvedValueOnce(new Response("audio"))
      .mockResolvedValueOnce(Response.json({ result: { textAnnotation: { fullText: "task" } } }));
    vi.stubGlobal("fetch", fetch);
    expect(await createLLMProvider(env).generate({ messages: [{ role: "user", text: "task" }], temperature: .35, maxTokens: 1300 })).toBe("answer");
    expect(await createSTTProvider(env).transcribe({ audio: new Uint8Array([1]), sampleRate: 16000, lang: "en-US" })).toEqual({ text: "voice" });
    await createTTSProvider(env).synthesize({ text: "answer", lang: "en-US", speed: .7, preset: "calm" });
    expect(await createVisionProvider(env).recognize("data:image/png;base64,YQ==")).toBe("task");
    expect(fetch.mock.calls.map(call => String(call[0]))).toEqual([expect.stringContaining("foundationModels"), expect.stringContaining("sampleRateHertz=16000"), expect.stringContaining("tts:synthesize"), expect.stringContaining("recognizeText")]);
    expect(fetch.mock.calls[2][1].body).toContain("speed=0.7");
  });
  it("uses compatible configuration and exactly one configured fallback", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("secret upstream detail"))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "fallback" } }] }));
    vi.stubGlobal("fetch", fetch);
    const provider = createLLMProvider({ ...env, LLM_FALLBACK_PROVIDER: "openai-compatible", LLM_FALLBACK_BASE_URL: "https://example.com/v1", LLM_FALLBACK_API_KEY: "secret", LLM_FALLBACK_MODEL: "model" });
    expect(await provider.generate({ messages: [{ role: "user", text: "input" }], temperature: .2, maxTokens: 100 })).toBe("fallback");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe("https://example.com/v1/chat/completions");
    expect(JSON.parse(fetch.mock.calls[1][1].body).messages).toEqual([{ role: "user", content: "input" }]);
  });
  it("selects a compatible primary without Yandex credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: "ok" } }] })));
    expect(await createLLMProvider({ LLM_PROVIDER: "openai-compatible", LLM_BASE_URL: "https://example.com/v1", LLM_API_KEY: "secret", LLM_MODEL: "model" }).generate({ messages: [], temperature: .2, maxTokens: 10 })).toBe("ok");
  });
  it("rejects unsupported selection and missing configuration safely", () => {
    for (const [factory, key] of [[createSTTProvider, "STT_PROVIDER"], [createTTSProvider, "TTS_PROVIDER"], [createVisionProvider, "VISION_PROVIDER"], [createLLMProvider, "LLM_PROVIDER"]] as const) {
      expect(() => factory({ ...env, [key]: "secret" })).toThrow("AI service unavailable");
      expect(() => factory({})).toThrow("AI service unavailable");
    }
  });
});
it("has no retries without fallback and sanitizes failures", async () => {
  const primary = vi.fn().mockRejectedValue(new Error("API_KEY=secret"));
  const log = vi.spyOn(console, "error");
  await expect(withFailover(primary)).rejects.toThrow("AI service unavailable");
  expect(primary).toHaveBeenCalledTimes(1);
  const fallback = vi.fn().mockRejectedValue(new Error("secret"));
  await expect(withFailover(primary, fallback)).rejects.toThrow("AI service unavailable");
  expect(fallback).toHaveBeenCalledTimes(1);
  expect(log).not.toHaveBeenCalled();
});
it("bounds hung operations and aborts before a single fallback", async () => {
  let signal: AbortSignal | undefined;
  const fallback = vi.fn().mockResolvedValue("ok");
  expect(await withFailover(s => { signal = s; return new Promise(() => {}); }, fallback, 5)).toBe("ok");
  expect(signal?.aborted).toBe(true);
  expect(fallback).toHaveBeenCalledTimes(1);
});
it("TTS failure stays separate from a successful tutor text response", async () => {
  vi.stubEnv("YANDEX_API_KEY", "test-key"); vi.stubEnv("YANDEX_FOLDER_ID", "test-folder");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("secret"))
    .mockResolvedValueOnce(Response.json({ result: { alternatives: [{ message: { text: JSON.stringify({ answer: "Попробуй объяснить первый шаг", correctness: "unknown" }) } }] } })));
  const voice = await speech(new Request("http://localhost/api/speech", { method: "POST", body: JSON.stringify({ text: "hello" }) }));
  expect(voice.status).toBe(503); expect(await voice.text()).not.toContain("secret");
  const text = await tutor(new Request("http://localhost/api/tutor", { method: "POST", body: JSON.stringify({ message: "Объясни тему", subject: "history", mode: "topic" }) }));
  expect(text.status).toBe(200); expect((await text.json()).answer).toBeTruthy();
});
it("browser voice is optional and preserves language and speed", () => {
  expect(speakWithBrowser("hello", "en-US", .7)).toBe(false);
  const speak = vi.fn(); vi.stubGlobal("window", { speechSynthesis: { cancel: vi.fn(), speak } });
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  expect(speakWithBrowser("hello", "en-US", .7)).toBe(true);
  expect(speak.mock.calls[0][0]).toMatchObject({ text: "hello", lang: "en-US", rate: .7 });
});
it("provider modules contain no learner pedagogy", () => {
  const source = readdirSync("lib/providers").filter(f => f.endsWith(".ts")).map(f => readFileSync(`lib/providers/${f}`, "utf8")).join("\n");
  expect(source).not.toMatch(/Соф|Луник|learnerConfig|supportStage|parentRules|I like read|Yesterday I go/);
});
