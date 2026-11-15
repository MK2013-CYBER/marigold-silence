/**
 * Every spoken line in the game, read from the JSON data, with who says it and in what situation.
 * Shared by tools/voices.mjs (the Mac's own voices) and tools/voices-gemini.mjs (Gemini voices),
 * so both always voice exactly the same script.
 *
 *   collectLines() -> [{ who, text, ctx }]
 *     who   speaker id (cole, hart, hobbs, vivienne, ...)
 *     text  the line as written in the JSON (may include narration around the quoted words)
 *     ctx   the situation, e.g. 'npc.press' or 'cole.reaction', used to choose how it is acted
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isNarration } from '../src/engine/speech-text.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const readData = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));

export function collectLines() {
  const out = [];
  const add = (who, text, ctx) => {
    if (typeof text !== 'string' || !text.trim()) return;
    if (/^(ox|clem)\./.test(ctx) && isNarration(text)) return; // a stage direction: shown, never spoken
    out.push({ who, text, ctx });
  };
  const addAll = (who, v, ctx) => {
    if (typeof v === 'string') add(who, v, ctx);
    else if (Array.isArray(v)) v.forEach((x) => addAll(who, x, ctx));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => addAll(who, x, ctx));
  };

  // ---- Danny Cole: at HQ, on the radio, hints, reactions
  const cole = readData('dialogue/cole.json');
  const coleCtx = {
    greetingFirst: 'cole.greeting', greetings: 'cole.greeting', walkieOpen: 'cole.radio', situation: 'cole.briefing',
    situationLater: 'cole.briefing', peopleIntro: 'cole.casual', people: 'cole.people', nextNone: 'cole.casual',
    hintIntro: 'cole.hint', hintMore: 'cole.casual', hintMaxed: 'cole.casual', hintNone: 'cole.casual',
    reportsNone: 'cole.casual', follow: 'cole.casual', stay: 'cole.casual', home: 'cole.casual',
    radioFollow: 'cole.radio', bye: 'cole.casual', reminders: 'cole.reminder', reactions: 'cole.reaction',
    solved: 'cole.solved', rest: 'cole.rest', wake: 'cole.wake', typewriter: 'cole.casual', lab: 'cole.casual',
    timelineEmpty: 'cole.casual',
  };
  for (const [k, ctx] of Object.entries(coleCtx)) addAll('cole', cole[k], ctx);
  for (let n = 1; n <= 9; n++) add('cole', cole.reportsNew.replace('{n}', n), 'cole.casual');
  for (const t of ['Anything else, Chief?', 'What else?', 'Sure. What else?', 'Any time, Chief.']) add('cole', t, 'cole.casual');
  for (const p of readData('puzzles.json').puzzles) addAll('cole', p.hints, 'cole.hint');

  // ---- the intro film
  const intro = readData('scenes/intro.json');
  add(intro.telegram.who, intro.telegram.vo, 'hart.telegram');
  for (const [k, l] of Object.entries(intro.lines)) add(l.who, l.text, `intro.${k}`);

  // ---- the suspects and Hobbs
  const npcs = readData('npcs.json');
  for (const [id, p] of Object.entries(npcs.people)) {
    addAll(id, p.greeting, 'npc.greeting');
    for (const t of p.topics) { add(id, t.text, 'npc.topic'); if (t.press) add(id, t.press.text, 'npc.press'); }
    for (const r of Object.values(p.present ?? {})) add(id, r.text, 'npc.present');
    add(id, p.presentDefault, 'npc.shrug');
    for (const t of ['What do you want to know?', 'Anything else, Inspector?', 'Anything else?', 'Inspector?']) add(id, t, 'npc.menu');
    add(id, "I'd rather not talk about that. Not with you. Not yet.", 'npc.locked');
  }

  // ---- the finale: Ox at the trapdoor, Clementine, the endings
  const fin = readData('finale.json');
  add('ox', fin.standoff.ox, 'ox.standoff');
  for (const o of fin.standoff.options) { add('ox', o.ok, 'ox.yield'); add('ox', o.no, 'ox.refuse'); }
  add('clementine', fin.standoff.voice, 'clem.dark');
  const C = fin.clementine;
  add('clementine', C.open, 'clem.open');
  add('clementine', C.reply, 'clem.reply');
  add('clementine', C.wrong, 'clem.wrong');
  add('clementine', C.notEnough, 'clem.notEnough');
  add('clementine', C.choiceIntro, 'clem.choice');
  C.confession.forEach((t) => add('clementine', t, 'clem.confession'));
  for (const p of C.prompts) { add('clementine', p.q, 'clem.question'); add('clementine', p.right, 'clem.right'); }
  for (const [k, e] of Object.entries(fin.endings)) if (e.lines) e.lines.forEach((l) => add('hart', l, `hart.ending.${k}`));

  // ---- the wax cylinder (S20): the Marigold's last radio call
  add('cylinder', readData('sequences.json').S20.voice.text, 'cylinder');
  return out;
}
