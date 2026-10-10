import { normalizeEnglishTranscript } from "@/lib/stt-normalization";

export const runtime = "nodejs";

function requireApiKey() {
  const apiKey = process.env.YANDEX_API_KEY;
  if (!apiKey) throw new Error("YANDEX_API_KEY не найден в .env.local");
  return apiKey;
}

function readWavSampleRate(buffer: Buffer) {
  if (buffer.length < 44) throw new Error("Аудиофайл слишком короткий.");
  return buffer.readUInt32LE(24);
}

function extractWavPcm(buffer: Buffer) {
  if (
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Ожидался WAV-файл.");
  }

  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "data") {
      const start = offset + 8;
      return buffer.subarray(start, start + chunkSize);
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  throw new Error("Не найден аудиоблок WAV.");
}

export async function POST(request: Request) {
  try {
    const apiKey = requireApiKey();
    const formData = await request.formData();
    const audio = formData.get("audio");
    const langValue = formData.get("lang");
    const lang = typeof langValue === "string" ? langValue : "ru-RU";

    if (!(audio instanceof File)) {
      return Response.json({ error: "Аудиофайл не найден." }, { status: 400 });
    }

    const wavBuffer = Buffer.from(await audio.arrayBuffer());
    const sampleRate = readWavSampleRate(wavBuffer);
    const pcmBuffer = extractWavPcm(wavBuffer);

    if (pcmBuffer.length > 1024 * 1024) {
      return Response.json(
        { error: "Голосовое слишком длинное. Запиши сообщение короче 30 секунд." },
        { status: 400 }
      );
    }

    const url = new URL(
      "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize"
    );
    url.searchParams.set("topic", lang === "en-US" ? "general:rc" : "general");
    url.searchParams.set("lang", lang);
    url.searchParams.set("format", "lpcm");
    url.searchParams.set("sampleRateHertz", String(sampleRate));

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        "Content-Type": "application/octet-stream",
      },
      // Node's Buffer is a Uint8Array at runtime, but the Fetch typings do not
      // accept Buffer as a request body. Converting it keeps the audio bytes
      // unchanged and makes the server route type-safe.
      body: new Uint8Array(pcmBuffer),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error_message || data?.message || "SpeechKit не смог распознать голос."
      );
    }

    const rawText = data?.result?.trim() || "";
    const text =
      lang === "en-US" ? normalizeEnglishTranscript(rawText) : rawText;

    return Response.json({ text, rawText });
  } catch (error) {
    console.error("Transcription error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось распознать голосовое сообщение.",
      },
      { status: 500 }
    );
  }
}
