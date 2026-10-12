import type { LLMProvider, LLMRequest, STTProvider, STTRequest, TTSProvider, TTSRequest, VisionProvider } from "./types";

export class ProviderError extends Error {
  constructor() { super("AI service unavailable"); this.name = "ProviderError"; }
}
async function checkedFetch(url: string | URL, init: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new ProviderError();
  return response;
}
export type YandexConfig = { apiKey: string; folderId: string };
export class YandexLLMProvider implements LLMProvider {
  constructor(private config: YandexConfig) {}
  async generate(request: LLMRequest, signal?: AbortSignal) {
    const response = await checkedFetch("https://ai.api.cloud.yandex.net/foundationModels/v1/completion", {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: `Api-Key ${this.config.apiKey}`, "x-folder-id": this.config.folderId, "x-data-logging-enabled": "false" },
      body: JSON.stringify({ modelUri: `gpt://${this.config.folderId}/yandexgpt/latest`, completionOptions: { stream: false, temperature: request.temperature, maxTokens: String(request.maxTokens), reasoningOptions: { mode: "ENABLED_HIDDEN" } }, messages: request.messages }),
    });
    const data = await response.json();
    const text = data?.result?.alternatives?.[0]?.message?.text;
    if (typeof text !== "string" || !text.trim()) throw new ProviderError();
    return text.trim();
  }
}
export type CompatibleConfig = { baseUrl: string; apiKey: string; model: string };
export class OpenAICompatibleLLMProvider implements LLMProvider {
  constructor(private config: CompatibleConfig) {}
  async generate(request: LLMRequest, signal?: AbortSignal) {
    const response = await checkedFetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ model: this.config.model, temperature: request.temperature, max_tokens: request.maxTokens, messages: request.messages.map(({ role, text }) => ({ role, content: text })) }),
    });
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new ProviderError();
    return text.trim();
  }
}
export class YandexSTTProvider implements STTProvider {
  constructor(private config: YandexConfig) {}
  async transcribe(request: STTRequest, signal?: AbortSignal) {
    const url = new URL("https://stt.api.cloud.yandex.net/speech/v1/stt:recognize");
    url.search = new URLSearchParams({ topic: request.lang === "en-US" ? "general:rc" : "general", lang: request.lang, format: "lpcm", sampleRateHertz: String(request.sampleRate) }).toString();
    const response = await checkedFetch(url, { method: "POST", signal, headers: { Authorization: `Api-Key ${this.config.apiKey}`, "Content-Type": "application/octet-stream" }, body: new Uint8Array(request.audio) });
    const data = await response.json();
    if (typeof data?.result !== "string") throw new ProviderError();
    return { text: data.result.trim() };
  }
}
export class YandexTTSProvider implements TTSProvider {
  constructor(private config: YandexConfig) {}
  async synthesize(request: TTSRequest, signal?: AbortSignal) {
    const params = new URLSearchParams({ text: request.text, format: "mp3", speed: String(request.speed), lang: request.lang, voice: request.lang === "en-US" ? "john" : "jane" });
    if (request.lang !== "en-US" && request.preset === "warm") params.set("emotion", "good");
    const response = await checkedFetch("https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize", { method: "POST", signal, headers: { Authorization: `Api-Key ${this.config.apiKey}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
    return response.arrayBuffer();
  }
}
export class YandexVisionProvider implements VisionProvider {
  constructor(private config: YandexConfig) {}
  async recognize(imageDataUrl: string, signal?: AbortSignal) {
    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new ProviderError();
    const response = await checkedFetch("https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText", { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Api-Key ${this.config.apiKey}`, "x-folder-id": this.config.folderId, "x-data-logging-enabled": "false" }, body: JSON.stringify({ mimeType: match[1], languageCodes: ["ru", "en"], model: "page", content: match[2] }) });
    const data = await response.json();
    const text = data?.result?.textAnnotation?.fullText;
    if (typeof text !== "string") throw new ProviderError();
    return text.trim();
  }
}
