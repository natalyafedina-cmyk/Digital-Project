# Provider configuration

The default remains Yandex and uses the existing `YANDEX_API_KEY` and
`YANDEX_FOLDER_ID`. No production variable changes are required.

LLM selection:

- `LLM_PROVIDER`: `yandex` (default) or `openai-compatible`.
- `LLM_BASE_URL`: HTTPS API root including any `/v1` prefix, without `/chat/completions`.
- `LLM_API_KEY`, `LLM_MODEL`: required for the compatible adapter.
- `LLM_FALLBACK_PROVIDER`, `LLM_FALLBACK_BASE_URL`, `LLM_FALLBACK_API_KEY`,
  `LLM_FALLBACK_MODEL`: optional second provider; absent means no fallback.

`STT_PROVIDER`, `TTS_PROVIDER`, `VISION_PROVIDER` currently select `yandex`.
The typed STT/Vision contracts allow additional adapters to be registered in the
resolver without modifying API routes. `STT_BASE_URL`, `STT_API_KEY`, `STT_MODEL`
are reserved for a future compatible STT adapter; they do not activate one today.
Unsupported or incomplete provider configurations fail with a generic error.

Each provider operation has a 20-second deadline and at most one configured
fallback attempt. Provider response bodies, network errors and credentials are
never logged or returned. The tutor's existing pedagogical regeneration is a
separate generation, preserving its help-ladder guard.

STT confidence is recognition metadata, never a learning outcome. The existing
transcript review and legacy normalization remain unchanged.

TTS is an independent request. When server speech fails, the client attempts
optional browser speech with the selected language and speed. Text remains usable
when neither speech implementation is available.

Local builds require the existing public Supabase URL and publishable key.
For compilation/route smoke only, temporary public placeholders can be supplied;
these do not verify authentication or production AI calls. Webpack is used for
builds because Turbopack's local worker-port creation is blocked in this cloud
execution environment.
