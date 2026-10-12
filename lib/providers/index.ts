import { OpenAICompatibleLLMProvider, ProviderError, YandexLLMProvider, YandexSTTProvider, YandexTTSProvider, YandexVisionProvider } from "./adapters";
import type { LLMProvider, STTProvider, TTSProvider, VisionProvider } from "./types";
export type * from "./types";
type Env = Record<string, string | undefined>;

// Each operation has a bounded deadline and at most one configured fallback.
export async function withFailover<T>(primary: (signal: AbortSignal) => Promise<T>, fallback?: (signal: AbortSignal) => Promise<T>, timeoutMs = 20000): Promise<T> {
  async function attempt(run: (signal: AbortSignal) => Promise<T>) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([run(controller.signal), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new ProviderError()); }, timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }
  try { return await attempt(primary); } catch {
    if (fallback) { try { return await attempt(fallback); } catch { /* sanitized below */ } }
    throw new ProviderError();
  }
}
function yandex(env: Env, folderRequired: boolean) {
  if (!env.YANDEX_API_KEY || (folderRequired && !env.YANDEX_FOLDER_ID)) throw new ProviderError();
  return { apiKey: env.YANDEX_API_KEY, folderId: env.YANDEX_FOLDER_ID || "" };
}
function llm(env: Env, prefix: string): LLMProvider {
  const provider = env[`${prefix}_PROVIDER`] || "yandex";
  if (provider === "yandex") return new YandexLLMProvider(yandex(env, true));
  if (provider === "openai-compatible") {
    const baseUrl = env[`${prefix}_BASE_URL`], apiKey = env[`${prefix}_API_KEY`], model = env[`${prefix}_MODEL`];
    if (!baseUrl || !apiKey || !model) throw new ProviderError();
    let url: URL;
    try { url = new URL(baseUrl); } catch { throw new ProviderError(); }
    if (url.protocol !== "https:" || url.username || url.password) throw new ProviderError();
    return new OpenAICompatibleLLMProvider({ baseUrl, apiKey, model });
  }
  throw new ProviderError();
}
export function createLLMProvider(env: Env = process.env): LLMProvider {
  const primary = llm(env, "LLM");
  const fallback = env.LLM_FALLBACK_PROVIDER ? llm(env, "LLM_FALLBACK") : undefined;
  return { generate: request => withFailover(signal => primary.generate(request, signal), fallback ? signal => fallback.generate(request, signal) : undefined) };
}
export function createSTTProvider(env: Env = process.env): STTProvider {
  if ((env.STT_PROVIDER || "yandex") !== "yandex") throw new ProviderError();
  const provider = new YandexSTTProvider(yandex(env, false));
  return { transcribe: request => withFailover(signal => provider.transcribe(request, signal)) };
}
export function createTTSProvider(env: Env = process.env): TTSProvider {
  if ((env.TTS_PROVIDER || "yandex") !== "yandex") throw new ProviderError();
  const provider = new YandexTTSProvider(yandex(env, false));
  return { synthesize: request => withFailover(signal => provider.synthesize(request, signal)) };
}
export function createVisionProvider(env: Env = process.env): VisionProvider {
  if ((env.VISION_PROVIDER || "yandex") !== "yandex") throw new ProviderError();
  const provider = new YandexVisionProvider(yandex(env, true));
  return { recognize: image => withFailover(signal => provider.recognize(image, signal)) };
}
