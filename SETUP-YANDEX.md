# AI-репетитор Софьи — переход на Yandex Cloud

1. В корневом `.env.local` должны быть только:

YANDEX_API_KEY=ВАШ_НОВЫЙ_СЕКРЕТНЫЙ_КЛЮЧ
YANDEX_FOLDER_ID=ID_КАТАЛОГА_DEFAULT

2. Скопируйте содержимое этого пакета в корень проекта `ai-tutor-sofia`.

3. При вопросе Windows о замене файлов выберите «Заменить».

Заменятся:
- app/api/tutor/route.ts
- app/api/transcribe/route.ts
- app/api/speech/route.ts
- app/subject/[subject]/[mode]/page.tsx

4. `lib/tutor-config.ts` из предыдущего пакета оставьте как есть.

5. Остановите dev-сервер и запустите снова:

npm run dev

6. Проверка:
- http://localhost:3000/subject/math/problem
- http://localhost:3000/subject/english/practice
- http://localhost:3000/parent

Важно:
- текстовый AI идёт через YandexGPT;
- фото сначала распознаётся через Vision OCR, затем текст передаётся Лунику;
- голос Софьи записывается в WAV/PCM 16 кГц и отправляется в SpeechKit;
- голосовые сообщения ограничены примерно 25 секундами;
- английскую TTS-озвучку позже лучше перевести на SpeechKit v3 с отдельным англоязычным голосом.
