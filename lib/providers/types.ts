export type LLMMessage = { role: string; text: string };
export type LLMRequest = { messages: LLMMessage[]; temperature: number; maxTokens: number };
export interface LLMProvider { generate(request: LLMRequest, signal?: AbortSignal): Promise<string> }
export type STTRequest = { audio: Uint8Array; sampleRate: number; lang: string };
export interface STTProvider { transcribe(request: STTRequest, signal?: AbortSignal): Promise<{ text: string; confidence?: number }> }
export type TTSRequest = { text: string; lang: string; speed: number; preset: string };
export interface TTSProvider { synthesize(request: TTSRequest, signal?: AbortSignal): Promise<ArrayBuffer> }
export interface VisionProvider { recognize(imageDataUrl: string, signal?: AbortSignal): Promise<string> }
