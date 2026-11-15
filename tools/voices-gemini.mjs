#!/usr/bin/env node
/**
 * Render every spoken line with Google's Gemini text-to-speech, one designed voice per character,
 * each line acted with its own emotion (tools/voice-direction.json).
 *
 *   npm run voices:gemini               render anything missing (safe to stop and run again)
 *   npm run voices:gemini -- --test     render one telling line per character first, to listen
 *   npm run voices:gemini -- --only=ox  just one character
 *   npm run voices:gemini -- --redo     re-render everything
 *   npm run voices:gemini -- --lite     use the cheaper, faster Flash-Lite model
 *
 * The key is read from .env.local (GEMINI_API_KEY=...), a file git ignores. The key is only ever
 * sent to Google's API, never written into the game: the game just plays the finished files.
 *
 * How it works:
 *  1. Once per character it designs a custom voice from the description in voice-direction.json
 *     (POST /v1beta/voices) and remembers its id in tools/gemini-voices.json.
 *  2. Each whole line goes to the Interactions API with that voice, the acting direction as
 *     'style', and optional vocal tags (<sigh>, <chuckle>) in the transcript.
 *  3. The WAV that comes back is trimmed, levelled, checked (not silent, not clipped, not
 *     suspiciously long) and saved as public/audio/vo/<who>/g_<hash>.m4a.
 *  4. public/audio/vo/manifest.json gets a 'gemini' section: who -> spoken words -> file.
 *     The game prefers these over the Mac voices whenever a line has one.
 * If Google says "too many requests" it waits and carries on; if the daily allowance is used up
 * it saves everything done so far and tells you to run it again later.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { collectLines, ROOT } from './vo-lines.mjs';
import { spokenText, narrationOf } from '../src/engine/speech-text.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const OUT = path.join(ROOT, 'public/audio/vo');
const MANIFEST = path.join(OUT, 'manifest.json');
const VOICE_IDS = path.join(ROOT, 'tools/gemini-voices.json');
const SAMPLES = path.join(ROOT, 'tools/voice-samples');
const TMP = path.join(OUT, '_tmp');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}`));
const ONLY = arg('only')?.split('=')[1]?.split(',');
const REDO = !!arg('redo');
const TEST = !!arg('test');

// ------------------------------------------------------------------ the key (never printed)
function readKey() {
  const f = path.join(ROOT, '.env.local');
  const m = fs.existsSync(f) && fs.readFileSync(f, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
  const key = m?.[1].trim();
  if (!key || key.includes('paste-your-key')) {
    console.error('No Gemini key yet. Run:  zsh tools/set-gemini-key.sh  and paste it there.');
    process.exit(1);
  }
  return key;
}
const KEY = readKey();
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/voice-direction.json'), 'utf8'));
const MODEL = arg('lite') ? 'gemini-3.8-flash-lite-tts' : D.model;

class QuotaDone extends Error {}

async function call(method, url, body) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${API}${url}`, {
        method,
        headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(180_000),
      });
    } catch (e) {
      if (attempt >= 4) throw e;
      console.log(`  network hiccup (${e.name}), retrying...`);
      await sleep(5000 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    // never echo request headers; Google's error bodies don't contain the key
    let err = {};
    try { err = JSON.parse(text).error ?? {}; } catch { /* not JSON */ }
    const msg = err.message ?? text.slice(0, 300);
    if (res.status === 429 || res.status === 503 || res.status === 500) {
      if (/per ?day|daily|PerDay/i.test(JSON.stringify(err))) throw new QuotaDone(msg);
      if (attempt >= 8) throw new QuotaDone(msg);
      const hint = JSON.stringify(err).match(/"retryDelay":"(\d+)s"/);
      const wait = hint ? Number(hint[1]) + 2 : Math.min(300, 15 * 2 ** attempt);
      console.log(`  Google says slow down (${res.status}); waiting ${wait}s...`);
      await sleep(wait * 1000);
      continue;
    }
    throw new Error(`${res.status}: ${msg}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

// ------------------------------------------------------------------ 1. one designed voice per character
async function designVoices(needed) {
  const ids = fs.existsSync(VOICE_IDS) ? JSON.parse(fs.readFileSync(VOICE_IDS, 'utf8')) : {};
  fs.mkdirSync(SAMPLES, { recursive: true });
  for (const who of needed) {
    const v = D.voices[who];
    const sig = hash(`${MODEL.replace('-lite', '')}|${v.gender}|${v.language}|${v.design}`);
    if (ids[who]?.sig === sig) continue;
    console.log(`Designing ${who}'s voice...`);
    const r = await call('POST', '/voices', {
      store: true,
      voice: { model: D.model, type: 'prompted', display_name: `Marigold Silence: ${who}`, gender: v.gender, language_code: v.language, prompted: { input: v.design } },
    });
    const id = r.id ?? r.voice?.id ?? r.name?.split('/').pop();
    if (!id) throw new Error(`No voice id came back for ${who}: ${JSON.stringify(r).slice(0, 200)}`);
    ids[who] = { id, sig };
    const sample = r.sample_audio?.data ?? r.sampleAudio?.data;
    if (sample) fs.writeFileSync(path.join(SAMPLES, `${who}.wav`), Buffer.from(sample, 'base64'));
    fs.writeFileSync(VOICE_IDS, JSON.stringify(ids, null, 2));
  }
  return ids;
}

// ------------------------------------------------------------------ 2. how each line is acted
function direction(who, text, ctx) {
  const spoken = spokenText(text);
  const table = D.lines[who] ?? {};
  const key = Object.keys(table).filter((k) => spoken.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  const o = key ? table[key] : {};
  const cue = narrationOf(text); // e.g. "He closes his eyes." -> part of the acting note
  let style = o.style ?? D.context[ctx] ?? D.context[ctx.split('.').slice(0, 2).join('.')] ?? '';
  if (!o.style && cue) style = [style, cue.replace(/\.$/, '').toLowerCase()].filter(Boolean).join('; ');
  return { spoken, style, say: o.say ?? spoken };
}

// ------------------------------------------------------------------ 3. audio: decode, trim, level, check
function readWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return { rate: 24000, pcm: new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1) };
  let off = 12, rate = 24000;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') rate = buf.readUInt32LE(off + 12);
    if (id === 'data') {
      const data = buf.subarray(off + 8, off + 8 + Math.min(size, buf.length - off - 8));
      return { rate, pcm: new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + (data.length & ~1))) };
    }
    off += 8 + size + (size & 1);
  }
  throw new Error('no audio data in the WAV');
}

function master({ rate, pcm }, words) {
  const x = Float32Array.from(pcm, (s) => s / 32768);
  const clipped = x.reduce((n, s) => n + (Math.abs(s) > 0.999), 0);
  // trim silence at both ends (keep a breath of room)
  const loud = (i) => Math.abs(x[i]) > 0.02;
  let a = 0, b = x.length - 1;
  while (a < b && !loud(a)) a++;
  while (b > a && !loud(b)) b--;
  a = Math.max(0, a - Math.round(rate * 0.08));
  b = Math.min(x.length - 1, b + Math.round(rate * 0.25));
  const y = x.subarray(a, b + 1);
  let sum = 0, peak = 0;
  for (const s of y) { sum += s * s; peak = Math.max(peak, Math.abs(s)); }
  const rms = Math.sqrt(sum / Math.max(1, y.length));
  const secs = y.length / rate;
  const problems = [];
  if (rms < 0.005 || secs < 0.25) problems.push('silent');
  if (clipped > 20) problems.push(`clipped (${clipped} samples)`);
  if (secs > words * 0.75 + 4) problems.push(`too long (${secs.toFixed(1)}s for ${words} words)`);
  // level every line to the same loudness (about -19 dBFS), never above -1 dB peak
  const gain = Math.min(0.11 / Math.max(rms, 1e-6), 0.89 / Math.max(peak, 1e-6));
  const out = new Int16Array(y.length);
  for (let i = 0; i < y.length; i++) out[i] = Math.max(-32767, Math.min(32767, Math.round(y[i] * gain * 32767)));
  return { rate, pcm: out, secs, problems };
}

function writeWav(file, { rate, pcm }) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.byteLength, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.byteLength, 40);
  fs.writeFileSync(file, Buffer.concat([h, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)]));
}

function audioFrom(r) {
  const found = [];
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    if (typeof v.data === 'string' && (v.type === 'audio' || /audio/.test(v.mime_type ?? v.mimeType ?? ''))) found.push(v.data);
    for (const x of Object.values(v)) walk(x);
  };
  walk(r.steps ?? r);
  return found.length ? Buffer.from(found[found.length - 1], 'base64') : null;
}

async function synth(voiceId, say, style) {
  const content = { type: 'text', text: say };
  if (style) content.annotations = [{ type: 'speech_metadata', style }];
  const r = await call('POST', '/interactions', {
    model: MODEL,
    input: [{ type: 'user_input', content: [content] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: voiceId }] },
  });
  const wav = audioFrom(r);
  if (!wav) throw new Error(`no audio in the reply: ${JSON.stringify(r).slice(0, 200)}`);
  return wav;
}

// ------------------------------------------------------------------ 4. the work list
const TEST_LINES = [
  ['cole', 'A trapdoor.'], ['hart', 'Inspector Hart. Come to Sable Flat.'], ['pryce', 'To Marigold.'],
  ['vivienne', 'Inspector, darling.'], ['billie', 'Get out of my face'], ['lindqvist', 'He closes his eyes.'],
  ['julian', 'For the first time'], ['ox', "Don't come down"], ['tamsin', 'She laughs without smiling'],
  ['hobbs', 'Tapping in the wires.'], ['clementine', 'He knew the mount was cracked.'], ['cylinder', 'Daddy'],
];
let jobs = [];
const seen = new Set();
for (const l of collectLines()) {
  const d = direction(l.who, l.text, l.ctx);
  const k = `${l.who}|${d.spoken}`;
  if (!d.spoken || seen.has(k)) continue;
  seen.add(k);
  jobs.push({ ...l, ...d, words: d.spoken.split(/\s+/).length });
}
const allJobs = jobs;
if (ONLY) jobs = jobs.filter((j) => ONLY.includes(j.who));
if (TEST) jobs = TEST_LINES.map(([who, start]) => jobs.find((j) => j.who === who && j.text.startsWith(start))).filter(Boolean);

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { voices: {}, lines: {} };
manifest.gemini ??= {};
const saveManifest = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest));

const voiceOf = (who) => D.sameVoice[who] ?? who;
const ids = await designVoices([...new Set(jobs.map((j) => voiceOf(j.who)))]);
fs.mkdirSync(TMP, { recursive: true });

let made = 0, kept = 0, flagged = [];
const pace = Number(arg('rpm')?.split('=')[1] ?? 0); // optional: requests per minute cap
console.log(`${jobs.length} lines to check (${MODEL}).`);
try {
  for (const [i, j] of jobs.entries()) {
    const vid = ids[voiceOf(j.who)].id;
    const file = `${j.who}/g_${hash(`${MODEL}|${vid}|${j.style}|${j.say}`)}.m4a`;
    const dest = path.join(OUT, file);
    if (fs.existsSync(dest) && !REDO) { (manifest.gemini[j.who] ??= {})[j.spoken] = file; kept++; continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let best = null;
    for (let attempt = 0; attempt < 3; attempt++) { // a take that is silent, clipped or rambling gets another go
      const t0 = Date.now();
      const take = master(readWav(await synth(vid, j.say, j.style)), j.words);
      if (!best || take.problems.length < best.problems.length) best = take;
      if (pace) await sleep(Math.max(0, 60000 / pace - (Date.now() - t0)));
      if (!take.problems.length) break;
      console.log(`  retake ${j.who}: ${take.problems.join(', ')}`);
    }
    if (best.problems.length) flagged.push(`${j.who}: "${j.spoken.slice(0, 60)}" -> ${best.problems.join(', ')}`);
    const wav = path.join(TMP, 'line.wav');
    writeWav(wav, best);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', '-c', '1', wav, dest]);
    (manifest.gemini[j.who] ??= {})[j.spoken] = file;
    made++;
    saveManifest(); // after every line, so stopping loses nothing
    console.log(`  [${i + 1}/${jobs.length}] ${j.who} (${best.secs.toFixed(1)}s) ${j.style ? `[${j.style}] ` : ''}${j.spoken.slice(0, 70)}`);
  }
} catch (e) {
  saveManifest();
  if (e instanceof QuotaDone) {
    console.log(`\nGoogle's allowance for now is used up (${e.message.slice(0, 160)}).`);
    console.log(`Saved ${made} new lines. Run  npm run voices:gemini  again later and it carries on from here.`);
    process.exit(2);
  }
  throw e;
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

// drop Gemini files and entries that no current line uses (only on a full run)
if (!ONLY && !TEST) {
  const live = new Set(allJobs.map((j) => `${j.who}|${j.spoken}`));
  for (const [who, o] of Object.entries(manifest.gemini)) for (const s of Object.keys(o)) if (!live.has(`${who}|${s}`)) delete o[s];
  const used = new Set(Object.values(manifest.gemini).flatMap((o) => Object.values(o)));
  for (const who of fs.readdirSync(OUT)) {
    const dir = path.join(OUT, who);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) if (f.startsWith('g_') && !used.has(`${who}/${f}`)) fs.rmSync(path.join(dir, f));
  }
}
manifest.geminiVoices = Object.fromEntries(Object.keys(manifest.gemini).map((w) => [w, `designed: ${voiceOf(w)}`]));
saveManifest();
console.log(`\nDone: ${made} rendered, ${kept} already there.`);
if (flagged.length) console.log(`Check these by ear:\n  ${flagged.join('\n  ')}`);
