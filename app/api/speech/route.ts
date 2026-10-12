import { createTTSProvider } from "@/lib/providers";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const text =
      typeof body.text === "string" ? body.text.trim().slice(0, 4500) : "";
    const subject =
      typeof body.subject === "string" ? body.subject : "general";
    const preset =
      typeof body.preset === "string" ? body.preset : "calm";
    const speed =
      typeof body.speed === "number"
        ? Math.min(1.3, Math.max(0.6, body.speed))
        : subject === "english"
        ? 0.9
        : 1;

    if (!text) {
      return Response.json(
        { error: "Нет текста для озвучивания." },
        { status: 400 }
      );
    }

    const audioBuffer = await createTTSProvider().synthesize({ text, lang: subject === "english" ? "en-US" : "ru-RU", speed, preset });

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "Не удалось озвучить ответ." }, { status: 503 });
  }
}
