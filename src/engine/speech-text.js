/**
 * What part of a line is actually spoken, split into sentences. Shared by the game
 * (src/engine/voice.js) and the voice renderer (tools/voices.mjs) so the two always agree.
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

export function spokenSentences(text) {
  const t = spokenText(text);
  if (!t) return [];
  return t.split(/(?<=[.!?…])\s+(?=[A-Z0-9'"(])/).map((s) => s.trim()).filter((s) => /[A-Za-z0-9]/.test(s));
}
