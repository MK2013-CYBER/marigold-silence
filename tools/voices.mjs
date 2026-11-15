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
import { collectLines } from './vo-lines.mjs';

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
SPEAKERS.cylinder = { voice: pickVoice(['Ava', 'Zoe', 'Shelley (English (United States))', 'Samantha']), rate: 1.05 };

// ------------------------------------------------------------------ every line, per speaker (tools/vo-lines.mjs)
const lines = {};
for (const { who, text } of collectLines()) {
  if (!SPEAKERS[who]) continue;
  for (const s of spokenSentences(text)) (lines[who] ??= new Set()).add(s);
}

// ------------------------------------------------------------------ render
fs.mkdirSync(OUT, { recursive: true });
const MAN = path.join(OUT, 'manifest.json');
// Gemini takes (tools/voices-gemini.mjs) have their own list, gemini.json, and g_ files: never touched here
const manifest = { _note: 'speaker -> sentence -> file (Mac voices). Built by tools/voices.mjs. Gemini takes are in gemini.json.', voices: {}, lines: {} };
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
  for (const f of fs.readdirSync(dir)) if (!f.startsWith('g_') && !used.has(`${who}/${f}`)) { fs.rmSync(path.join(dir, f)); pruned++; }
}
if (pruned) console.log(`Removed ${pruned} unused files.`);
fs.writeFileSync(MAN, JSON.stringify(manifest));
console.log(`Voices: ${Object.entries(manifest.voices).map(([k, v]) => `${k}=${v}`).join(', ')}`);
console.log(`Lines: ${made} rendered, ${kept} kept, ${Object.values(manifest.lines).reduce((a, o) => a + Object.keys(o).length, 0)} in total.`);
