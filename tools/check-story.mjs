// Story consistency check: run with  node tools/check-story.mjs
// It reads the game's JSON (all the story text lives there) and the code that hands out evidence,
// then checks that the clues, answers and conversations agree with each other.
// Prints every problem it finds; exits with code 1 if there are any.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const J = (p) => JSON.parse(readFileSync(join(root, 'src/data', p), 'utf8'));
const findings = J('findings.json').findings;
const seq = J('sequences.json');
const npcs = J('npcs.json');
const finale = J('finale.json');
const puzzles = J('puzzles.json').puzzles;
const intro = J('scenes/intro.json');
const reports = J('reports.json').reports;

const problems = [];
const bad = (msg) => problems.push(msg);
const byId = new Map(findings.map((f) => [f.id, f]));

// ---- 1. every place a source is given ('sources' / 'gives' lists in the JSON, evidence.add(...) in code)
const grants = []; // [fid, src, where]
const walk = (o, where) => {
  if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${where}[${i}]`));
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if ((k === 'sources' || k === 'gives') && Array.isArray(v) && Array.isArray(v[0])) for (const [f, s] of v) grants.push([f, s, where]);
    else walk(v, `${where}.${k}`);
  }
};
walk(seq, 'sequences'); walk(npcs, 'npcs'); walk(finale, 'finale');
const codeFiles = [];
const scan = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) scan(p); else if (n.endsWith('.js')) codeFiles.push(p); } };
scan(join(root, 'src'));
for (const p of codeFiles) {
  for (const m of readFileSync(p, 'utf8').matchAll(/evidence\.add\('(F\d+)',\s*'([^']+)'/g)) grants.push([m[1], m[2], p.replace(root, '')]);
}

for (const [f, s, where] of grants) {
  const F = byId.get(f);
  if (!F) { bad(`${where}: gives ${f}, which isn't a finding`); continue; }
  if (!F.leads?.[s]) bad(`${f} from '${s}' (${where}) has no lead text: the player would see a generic line`);
}

// ---- 2. every finding can actually be established, and lists the sources it really gets
for (const F of findings) {
  const got = new Set(grants.filter(([f]) => f === F.id).map(([, s]) => s));
  if (got.size < F.need) bad(`${F.id} "${F.name}" needs ${F.need} sources but only ${got.size} exist (${[...got].join(', ') || 'none'})`);
  for (const s of F.sources) if (!got.has(s)) bad(`${F.id} lists source '${s}', but nothing in the game gives it`);
  for (const s of got) if (!F.sources.includes(s)) bad(`${F.id} is given by '${s}', which its 'sources' list doesn't mention`);
  for (const s of Object.keys(F.leads ?? {})) if (!got.has(s)) bad(`${F.id} has a lead for '${s}', which nothing gives`);
  if (F.need > Math.min(3, F.sources.length)) bad(`${F.id}: need ${F.need} is more than min(3, sources listed)`);
}

// ---- 3. conversations: 'requires' and 'present' point at real things
const flagsSet = new Set(['photo', 'musicbox', 'trapOpen', 'diaryRead', 'confessed', 'oxPassed', 'theoryFiled', 'wireNoticed', 'ghost12', 'mural', 'drawings', 'calendar', 'spoonkey']);
for (const [id, p] of Object.entries(npcs.people)) {
  for (const t of p.topics) {
    if (t.flag) flagsSet.add(t.flag);
    for (const r of t.requires ?? []) {
      if (/^F\d+$/.test(r) && !byId.has(r)) bad(`${id}.${t.id} requires unknown finding ${r}`);
      if (r.startsWith('flag:') && !flagsSet.has(r.slice(5)) && !Object.keys(seq.examine).includes(r.slice(5))) bad(`${id}.${t.id} requires flag '${r.slice(5)}', which is never set`);
    }
    if (/ask me again|rather not|won't say|not yet/i.test(t.text) && t.gives?.length) bad(`${id}.${t.id}: refuses to answer but still counts as testimony`);
  }
  for (const fid of Object.keys(p.present ?? {})) if (!byId.has(fid)) bad(`${id} reacts to unknown finding ${fid}`);
}

// ---- 4. answer keys agree with the clues that lead to them
// S3: the thermometer arithmetic lands inside the accepted window, and before the tune at ten
{
  const d = seq.S3, t = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const hours = (98.6 - d.reading.temp) / 1.5;
  let death = t(d.reading.time) - hours * 60; if (death < 0) death += 1440;
  if (Math.abs(death - t(d.check.mustInclude)) > 10) bad(`S3: ${d.reading.temp}°F at ${d.reading.time} means death at ${Math.floor(death / 60)}:${String(Math.round(death % 60)).padStart(2, '0')}, but the answer is ${d.check.mustInclude}`);
  if (t(d.check.latest) > t('22:00')) bad('S3: the accepted window runs past ten, so it cannot prove the music box played after his death');
  const card = seq.S25.cards.find((c) => c.id === 'death');
  if (Math.abs(card.t - t(d.check.mustInclude)) > 15) bad(`S25: the death card (${card.text}) disagrees with S3 (${d.check.mustInclude})`);
}
// S5: the riddle's three numbers are on the walls
{
  const age = +/nineteen|(\d+) today/.exec(seq.examine.photo.text)?.[0].replace('nineteen', '19');
  const engines = /three-engined/.test(seq.examine.photo.text) ? 3 : NaN;
  const minute = +/past three|(\d+) past/.test(seq.examine.watch.text) && +/seventeen/.test(seq.examine.watch.text) ? 17 : NaN;
  if (`${seq.S5.combo}` !== `${[age, engines, minute]}`) bad(`S5: the safe combination ${seq.S5.combo} doesn't follow from the photo and watch (${age}, ${engines}, ${minute})`);
  const tamsin = npcs.people.tamsin.topics.find((x) => x.id === 'safe').text;
  if (!/nineteen, three, seventeen/i.test(tamsin)) bad("S5: Tamsin's combination doesn't match the safe");
}
// S6: Hobbs's tune is the tune
{
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  const said = npcs.people.hobbs.topics.find((x) => x.id === 'tune').text.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight)\b/g).map((w) => words.indexOf(w));
  if (`${said}` !== `${seq.S6.tune}`) bad(`S6: Hobbs counts the tune as ${said}, but the latch wants ${seq.S6.tune}`);
}
// S10: every passenger with a certificate can be matched to it
for (const [n, name] of seq.S10.cards) if (n !== seq.S10.answer && !seq.S10.certs.some((c) => name.startsWith(c))) bad(`S10: seat ${n} (${name}) has no matching certificate`);
// S16: the answer is the only unlogged loss
{
  const d = seq.S16;
  const logged = Object.fromEntries([...d.log.matchAll(/Tank (\w) (\d+) gal/g)].map((m) => [m[1], +m[2]]));
  const odd = d.tanks.filter((t) => t.yesterday - t.now !== (logged[t.id] ?? 0)).map((t) => [t.id, t.yesterday - t.now - (logged[t.id] ?? 0)]);
  if (odd.length !== 1 || `${odd[0]}` !== `${d.answer}`) bad(`S16: unlogged losses are ${JSON.stringify(odd)}, answer is ${d.answer}`);
}
// S23: the lifted prints match the answers
for (const l of seq.S23.lifted) {
  const m = Object.entries(seq.S23.people).filter(([, p]) => p.pattern === l.pattern && p.width === l.width && p.scar === l.scar).map(([id]) => id);
  if ((m[0] ?? 'nobody') !== l.answer || m.length > 1) bad(`S23: ${l.name} matches ${m.join(', ') || 'nobody'}, answer says ${l.answer}`);
}
// S24: the cipher decodes with the keyword
{
  const d = seq.S24, A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const key = [...new Set((d.keyword + A).split(''))].join('');
  const dec = d.cipher.replace(/[A-Z]/g, (c) => A[key.indexOf(c)]);
  if (dec !== d.plain) bad(`S24: '${d.cipher}' decodes to '${dec}', not '${d.plain}'`);
}
// S14: the ledger's first page, the answer option and Danny's hint give the same date
{
  const first = seq.S14.pages.at(-1).text.match(/\d+ \w+ \d{4}/)?.[0];
  if (!seq.S14.options[seq.S14.answer].includes(first)) bad(`S14: ledger starts ${first}, the right answer says '${seq.S14.options[seq.S14.answer]}'`);
  const hint = puzzles.find((p) => p.id === 'S14').hints.at(-1);
  if (!hint.includes(first)) bad(`S14: Danny's last hint disagrees with the ledger (${first})`);
}
// S18: the tape's word is in the telegram
{
  const word = seq.S18.tape.name.match(/'([A-Z]+)'/)?.[1];
  if (word && !intro.telegram.lines.join(' ').includes(word)) bad(`S18: the tape is the Q in '${word}', but the telegram never says ${word}`);
}
// money: the stubs, the cipher, the note and Tamsin agree
{
  const stubs = seq.S5.contents.find((c) => c.id === 'stubs').text;
  const tam = npcs.people.tamsin.present.F27.text;
  if (!/two hundred/i.test(stubs) || !/PAID 200/.test(seq.S24.plain) || !/two hundred a month/i.test(tam)) bad('Blackmail: the stubs, the cipher and Tamsin disagree about the monthly amount');
  if (/five hundred a month/i.test(tam)) bad('Blackmail: Tamsin says five hundred a month');
}
// dates: the crash was May 1931; the hidden ration starts six months later
{
  const all = JSON.stringify([seq, npcs, finale, reports, puzzles]);
  for (const m of all.matchAll(/(\w+) 1931/g)) if (/November/.test(m[1]) && !/\d+ November 1931/.test(all.slice(m.index - 3, m.index + 14)) && !/label/.test(all.slice(m.index - 9, m.index))) bad(`Date: '${m[0]}' (the Marigold crashed in May 1931)`);
  const pilots = new Set([...all.matchAll(/Capt\. (\w\. \w+)|(Tom Reeve|R\. Hale)/g)].map((m) => m[0]));
  if ([...pilots].some((p) => /Hale/.test(p))) bad(`Pilot names disagree: ${[...pilots].join(', ')}`);
}
// Danny's hints about walking places don't point at things that give nothing
for (const p of puzzles) for (const h of p.hints ?? []) if (/Waco's fuel cap/.test(h)) bad(`${p.id}: Danny sends you to the Waco's fuel cap, which proves nothing`);

if (problems.length) {
  console.log(`${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Story check passed: ${findings.length} findings, ${grants.length} evidence sources, all conversations and answer keys agree.`);
