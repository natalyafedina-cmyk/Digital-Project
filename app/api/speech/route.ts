export const runtime = "nodejs";

function requireApiKey() {
  const apiKey = process.env.YANDEX_API_KEY;
  if (!apiKey) throw new Error("YANDEX_API_KEY не найден в .env.local");
  return apiKey;
}

export async function POST(request: Request) {
  try {
    const apiKey = requireApiKey();
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

    const params = new URLSearchParams();
    params.set("text", text);
    params.set("format", "mp3");
    params.set("speed", String(speed));

    if (subject === "english") {
      params.set("voice", "john");
      params.set("lang", "en-US");
    } else {
      params.set("voice", "jane");
      params.set("lang", "ru-RU");

      if (preset === "warm") params.set("emotion", "good");
    }

    const response = await fetch(
      "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize",
      {
        method: "POST",
        headers: {
          Authorization: `Api-Key ${apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "SpeechKit не смог озвучить ответ.");
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Speech error:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось озвучить ответ.",
      },
      { status: 500 }
    );
  }
}
