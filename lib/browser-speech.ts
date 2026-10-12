// Optional enhancement: a voice outage must never reject the text response.
export function speakWithBrowser(text: string, lang: string, speed: number): boolean {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = speed;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch { return false; }
}
