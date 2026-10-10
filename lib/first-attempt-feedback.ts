export function buildFirstIncorrectAttemptHint(
  subject: string,
  userText: string
) {
  if (subject === "english") {
    const text = userText.trim();
    const lower = text.toLowerCase();

    if (/\byesterday\b.*\bgo\b/.test(lower)) {
      return 'Look at “yesterday” and the verb “go”. Do they show the same time? Try the sentence again.';
    }

    if (/\bmy\s+favou?rite\s+hobby\s+is\s+read\b/.test(lower)) {
      return 'Look at “is read”. Does that verb form fit after “My favorite hobby is …”? Try that part again.';
    }

    return 'Check one verb phrase in your sentence. Does its form match what you want to say? Try once more.';
  }

  if (subject === "history") {
    return "Проверь свою версию ещё раз. Вспомни, что именно было предметом спора между сторонами, и попробуй назвать одну конкретную причину сама.";
  }

  if (subject === "literature") {
    return "Проверь свою версию ещё раз: вернись к поступку, мотиву или детали текста, на которой строился вопрос, и попробуй сформулировать ответ сама.";
  }

  return "Проверь свою версию ещё раз. Вернись к ключевой связи из объяснения и попробуй назвать один конкретный шаг или факт сама.";
}
