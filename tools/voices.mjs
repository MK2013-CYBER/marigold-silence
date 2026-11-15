#!/usr/bin/env node
/**
 * Stage H: render every spoken line in the game to an audio file, per character, with the best
 * voice installed on this Mac (Premium / Enhanced voices first, if you have downloaded them in
 * System Settings > Accessibility > Spoken Content > System Voice > Manage Voices).
 *
 *   npm run voices            render anything missing
 *   npm run voices -- --all   re-render everything (e.g. after installing better voices)
 *
 * Output: public/audio/vo/<speaker>/<hash>.m4a and public/audio/vo/manifest.json
 * The game (src/engine/voice.js) plays these files sentence by sentence and falls back to the
 * browser's live speech only for a sentence that has no file. Real voice actors can later drop
 * their recordings in with the same names.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spokenSentences } from '../src/engine/speech-text.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));
const OUT = path.join(ROOT, 'public/audio/vo');
const ALL = process.argv.includes('--all');

// ------------------------------------------------------------------ voices per speaker
const cast = D('cast.json').people;
const installed = execFileSync('say', ['-v', '?'], { encoding: 'utf8' }).split('\n').map((l) => l.replace(/\s+[a-z]{2}_[A-Z]{2}\s+#.*$/, '').trim()).filter(Boolean);
const pickVoice = (prefer = []) => {
  for (const name of prefer) {
    const hits = installed.filter((v) => v.startsWith(name.replace(/ \(English \((United States|United Kingdom)\)\)/, '')) && (!name.includes('(') || v.includes(name.includes('United Kingdom') ? 'UK' : name.includes('United States') ? 'US' : '')));
    const best = hits.find((v) => /Premium|Enhanced/.test(v)) ?? hits[0];
    if (best) return best;
  }
  return 'Samantha';
};
const SPEAKERS = {};
for (const [id, p] of Object.entries(cast)) if (p.voice) SPEAKERS[id] = { voice: pickVoice(p.voice.prefer), rate: p.voice.rate ?? 1 };
SPEAKERS.cylinder = { voice: pickVoice(['Zoe', 'Ava', 'Shelley (English (United States))', 'Samantha']), rate: 1.05 };

// ------------------------------------------------------------------ every line, per speaker
const lines = {};
const add = (who, text) => { if (!text || !SPEAKERS[who]) return; for (const s of spokenSentences(text)) (lines[who] ??= new Set()).add(s); };
const addAll = (who, v) => { if (typeof v === 'string') add(who, v); else if (Array.isArray(v)) v.forEach((x) => addAll(who, x)); else if (v && typeof v === 'object') Object.values(v).forEach((x) => addAll(who, x)); };

const cole = D('dialogue/cole.json');
for (const k of ['greetingFirst', 'greetings', 'walkieOpen', 'situation', 'situationLater', 'peopleIntro', 'people', 'nextNone', 'hintIntro', 'hintMore', 'hintMaxed', 'hintNone', 'reportsNone', 'follow', 'stay', 'home', 'radioFollow', 'bye', 'reminders', 'reactions', 'solved', 'rest', 'wake', 'typewriter', 'lab', 'timelineEmpty']) addAll('cole', cole[k]);
for (let n = 1; n <= 9; n++) add('cole', cole.reportsNew.replace('{n}', n));
for (const t of ['Anything else, Chief?', 'What else?', 'Sure. What else?', 'Any time, Chief.']) add('cole', t);
for (const p of D('puzzles.json').puzzles) addAll('cole', p.hints);

const intro = D('scenes/intro.json');
add(intro.telegram.who, intro.telegram.vo);
for (const l of Object.values(intro.lines)) add(l.who, l.text);

const npcs = D('npcs.json');
for (const [id, p] of Object.entries(npcs.people)) {
  addAll(id, p.greeting);
  for (const t of p.topics) { add(id, t.text); if (t.press) add(id, t.press.text); }
  for (const r of Object.values(p.present ?? {})) add(id, r.text);
  add(id, p.presentDefault);
  for (const t of ['What do you want to know?', 'Anything else, Inspector?', 'Anything else?', "I'd rather not talk about that. Not with you. Not yet.", 'Inspector?', npcs.ui.presentIntro, npcs.ui.nothingToPresent]) add(id, t);
}

const fin = D('finale.json');
add('ox', fin.standoff.ox);
for (const o of fin.standoff.options) { add('ox', o.ok); add('ox', o.no); }
add('clementine', fin.standoff.voice);
const C = fin.clementine;
for (const t of [C.open, C.reply, C.wrong, C.notEnough, C.choiceIntro, ...C.confession]) add('clementine', t);
for (const p of C.prompts) { add('clementine', p.q); add('clementine', p.right); }
for (const e of Object.values(fin.endings)) if (e.lines) e.lines.forEach((l) => add('hart', l));
add('cylinder', D('sequences.json').S20.voice.text);

// ------------------------------------------------------------------ render
fs.mkdirSync(OUT, { recursive: true });
const manifest = { _note: 'speaker -> sentence -> file. Built by tools/voices.mjs.', voices: {}, lines: {} };
let made = 0, kept = 0;
const tmp = path.join(OUT, '_tmp.aiff');
for (const [who, set] of Object.entries(lines)) {
  const sp = SPEAKERS[who];
  manifest.voices[who] = sp.voice;
  fs.mkdirSync(path.join(OUT, who), { recursive: true });
  manifest.lines[who] = {};
  for (const s of set) {
    const file = `${who}/${createHash('sha1').update(`${sp.voice}|${s}`).digest('hex').slice(0, 12)}.m4a`;
    const dest = path.join(OUT, file);
    manifest.lines[who][s] = file;
    if (fs.existsSync(dest) && !ALL) { kept++; continue; }
    execFileSync('say', ['-v', sp.voice, '-r', String(Math.round(175 * sp.rate)), '-o', tmp, s]);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', '-c', '1', tmp, dest]);
    made++;
    if (made % 25 === 0) console.log(`  ${made} rendered...`);
  }
}
fs.rmSync(tmp, { force: true });
// remove files no line uses any more (e.g. after a speaker's voice changed)
const used = new Set(Object.values(manifest.lines).flatMap((o) => Object.values(o)));
let pruned = 0;
for (const who of fs.readdirSync(OUT)) {
  const dir = path.join(OUT, who);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) if (!used.has(`${who}/${f}`)) { fs.rmSync(path.join(dir, f)); pruned++; }
}
if (pruned) console.log(`Removed ${pruned} unused files.`);
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`Voices: ${Object.entries(manifest.voices).map(([k, v]) => `${k}=${v}`).join(', ')}`);
console.log(`Lines: ${made} rendered, ${kept} kept, ${Object.values(manifest.lines).reduce((a, o) => a + Object.keys(o).length, 0)} in total.`);
