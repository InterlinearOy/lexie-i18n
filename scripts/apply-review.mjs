// Write the reviewer's decisions back into the catalog.
//
//   node scripts/apply-review.mjs <token>            # fetch her work from the live tool
//   node scripts/apply-review.mjs --from saved.json  # or from a file the API returned
//   add --dry-run to see the changes without writing anything
//
// Her work lives in Supabase, behind lexie-web's /api/translation/<token>.
// That endpoint returns { brief, saved }. `saved` is keyed the way the brief
// keyed each row: `term:<id>` for a glossary term, else the bundle key path of
// the string, prefixed by nothing. `brief.rows[].target` says which bundle.
//
// Where each decision goes:
//   term:*          meta/glossary.json   de = her final, deStatus = confirmed
//   store.*         meta/store.json      de on the field (store text ships in
//                                        no bundle, so it cannot live in locales)
//   everything else locales/shared/de.json when the key is an alias of a shared
//                   string, otherwise locales/<target>/de.json
//
// A row she never opened is skipped. A row she approved without editing keeps
// the draft, which the catalog already holds. A final that drops a placeholder
// is refused and listed, because that would crash a screen, not just read badly.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE_ORIGIN || 'https://www.lexielearn.com';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fromIdx = args.indexOf('--from');
const token = args.find((a) => !a.startsWith('--') && a !== args[fromIdx + 1]);

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const write = (p, data) => {
  if (dryRun) return;
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(data, null, 2) + '\n');
};
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, p, v) => {
  const ks = p.split('.');
  const last = ks.pop();
  let cur = o;
  for (const k of ks) cur = (cur[k] ??= {});
  cur[last] = v;
};
const holes = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

/* ---------------- load her work ---------------- */
let payload;
if (fromIdx !== -1) {
  payload = JSON.parse(fs.readFileSync(args[fromIdx + 1], 'utf8'));
} else if (token) {
  const res = await fetch(`${SITE}/api/translation/${token}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`The tool answered ${res.status}. Is the token right, and not revoked?`);
    process.exit(1);
  }
  payload = await res.json();
} else {
  console.error('Usage: apply-review.mjs <token> | --from <file>   [--dry-run]');
  process.exit(1);
}
const { brief, saved, locale = 'de' } = payload;
if (!brief?.rows || !saved) {
  console.error('That is not the shape /api/translation returns.');
  process.exit(1);
}

/* ---------------- aliases: bundle path -> shared key ---------------- */
const aliases = read('meta/aliases.json');
const sharedKeyFor = { app: new Map(), web: new Map() };
for (const [key, v] of Object.entries(aliases)) {
  if (key === '_comment') continue;
  sharedKeyFor.app.set(v.app, key);
  for (const w of [v.web].flat()) sharedKeyFor.web.set(w, key);
}

/* ---------------- apply ---------------- */
const glossary = read('meta/glossary.json');
const store = read('meta/store.json');
const files = {
  shared: read(`locales/shared/${locale}.json`),
  app: read(`locales/app/${locale}.json`),
  web: read(`locales/web/${locale}.json`),
};

const changed = [];   // wording she changed
const kept = [];      // approved, draft stands
const skipped = [];   // never opened
const refused = [];   // placeholder lost
const notes = [];

const decide = (key, draft) => {
  const s = saved[key];
  if (!s) { skipped.push(key); return null; }
  if (s.note) notes.push({ key, note: s.note });
  const final = typeof s.final === 'string' && s.final.trim() ? s.final.trim() : draft;
  if (final === draft) { kept.push(key); return null; }
  return final;
};

for (const t of brief.terms) {
  const key = `term:${t.id}`;
  const term = glossary.terms[t.id];
  if (!term) continue;
  const final = decide(key, t.de);
  if (saved[key]) {
    term.deStatus = 'confirmed';
    if (saved[key].note) term.reviewerNote = saved[key].note;
  }
  if (final === null) continue;
  changed.push({ key, from: term.de, to: final });
  term.de = final;
}

for (const r of brief.rows) {
  const final = decide(r.key, r.de);
  if (final === null) continue;
  if (holes(final) !== holes(r.en)) {
    refused.push({ key: r.key, final, expected: holes(r.en) || '(none)' });
    continue;
  }
  if (r.target === 'store') {
    const f = store.fields.find((x) => x.id === r.key);
    if (!f) continue;
    if (final.length > f.limit) {
      console.warn(`  ! ${r.key} is ${final.length} characters, limit ${f.limit}. Written anyway; fix before submission.`);
    }
    changed.push({ key: r.key, from: f.de ?? r.de, to: final });
    f.de = final;
    continue;
  }
  const shared = sharedKeyFor[r.target]?.get(r.key);
  const file = shared ? 'shared' : r.target;
  const keyInFile = shared ?? r.key;
  changed.push({ key: `${file}:${keyInFile}`, from: get(files[file], keyInFile) ?? r.de, to: final });
  set(files[file], keyInFile, final);
}

/* ---------------- report ---------------- */
console.log(`${brief.terms.length} terms and ${brief.rows.length} strings in the brief.`);
console.log(`  ${changed.length} reworded, ${kept.length} approved as drafted, ${skipped.length} not opened, ${refused.length} refused.\n`);
for (const c of changed) console.log(`${c.key}\n    ${c.from}\n  > ${c.to}`);
if (notes.length) {
  console.log('\nHer notes:');
  for (const n of notes) console.log(`  ${n.key}: ${n.note}`);
}
if (skipped.length) console.log(`\nNot opened: ${skipped.join(', ')}`);
if (refused.length) {
  console.log('\nREFUSED, placeholder mismatch. Fix by hand:');
  for (const r of refused) console.log(`  ${r.key} expects {${r.expected}}: ${r.final}`);
}

if (dryRun) {
  console.log('\nDry run, nothing written.');
  process.exit(refused.length ? 1 : 0);
}

write('meta/glossary.json', glossary);
write('meta/store.json', store);
write(`locales/shared/${locale}.json`, files.shared);
write(`locales/app/${locale}.json`, files.app);
write(`locales/web/${locale}.json`, files.web);

console.log('\nWritten. Rebuilding and checking:');
execSync('node scripts/build.mjs && node scripts/check.mjs', { cwd: ROOT, stdio: 'inherit' });
process.exit(refused.length ? 1 : 0);
