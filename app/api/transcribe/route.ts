import { createSTTProvider } from "@/lib/providers";
import { normalizeEnglishTranscript } from "@/lib/stt-normalization";

export const runtime = "nodejs";

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

    const recognized = await createSTTProvider().transcribe({ audio: new Uint8Array(pcmBuffer), sampleRate, lang });
    const rawText = recognized.text;
    const text =
      lang === "en-US" ? normalizeEnglishTranscript(rawText) : rawText;

    return Response.json({ text, rawText });
  } catch {
    return Response.json({ error: "Не удалось распознать голосовое сообщение." }, { status: 500 });
  }
}
