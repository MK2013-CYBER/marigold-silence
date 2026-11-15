/**
 * What part of a line is actually spoken, split into sentences. Shared by the game
 * (src/engine/voice.js) and the voice renderer (tools/voices-gemini.mjs) so the two always agree.
 *  - If a line mixes narration and speech ('He closes his eyes. "Cyanide. Yes."'), only the
 *    words inside quotation marks are spoken.
 *  - *stage directions* and [sound notes] are never spoken.
 */
export function spokenText(text) {
  let t = String(text ?? '').replace(/\*[^*]*\*/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  const quoted = [...t.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1]);
  if (quoted.length) t = quoted.join(' ');
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * The narration around the quoted words ('He closes his eyes.'): never spoken, but the Gemini
 * voice tool uses it as acting direction for the line.
 */
export function narrationOf(text) {
  const t = String(text ?? '');
  if (!/["“]/.test(t)) return '';
  return t.replace(/["“][^"”]*["”]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * A line that is only a stage direction ('His shoulders drop. He lowers the wrench, slowly.'):
 * no quotation marks, starts with He/She/His/Her, no I/me/you. Shown on screen, never spoken.
 * Only the finale writes lines like this, so only the finale checks for them.
 */
export function isNarration(text) {
  const t = String(text ?? '').trim();
  return !/["“]/.test(t) && /^(He|She|His|Her)\b/.test(t) && !/\b(I|I'm|I'd|I'll|me|my|you|your|we|us|our)\b/i.test(t);
}

export function spokenSentences(text) {
  const t = spokenText(text);
  if (!t) return [];
  return t.split(/(?<=[.!?…])\s+(?=[A-Z0-9'"(])/).map((s) => s.trim()).filter((s) => /[A-Za-z0-9]/.test(s));
}
