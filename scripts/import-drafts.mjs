// Merge drafted translations into a locale, without touching what is already there.
//
//   node scripts/import-drafts.mjs de path/to/drafts/*.json
//
// Each file holds { "<shared|app|web>": { "<flat.key>": "<string>" } }. A key
// is refused when it is not in the base language, when it already carries a
// value in the target locale (a reviewed string must never be overwritten by a
// fresh draft), or when its {placeholders} differ from the base. Everything
// else is written, then the bundles are rebuilt and checked.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [locale, ...files] = process.argv.slice(2);
if (!locale || !files.length) {
  console.error('Usage: import-drafts.mjs <locale> <file.json> [more files]');
  process.exit(1);
}

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p + k + '.') : [[p + k, v]]
  );
const set = (o, p, v) => {
  const ks = p.split('.');
  const last = ks.pop();
  let cur = o;
  for (const k of ks) cur = (cur[k] ??= {});
  cur[last] = v;
};
const holes = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const targets = {};
for (const ns of ['shared', 'app', 'web']) {
  targets[ns] = {
    base: new Map(flat(read(path.join(ROOT, `locales/${ns}/en.json`)))),
    own: read(path.join(ROOT, `locales/${ns}/${locale}.json`)),
  };
  targets[ns].ownKeys = new Set(flat(targets[ns].own).map(([k]) => k));
}

let written = 0;
const refused = [];
for (const file of files) {
  const data = read(file);
  for (const [ns, entries] of Object.entries(data)) {
    const t = targets[ns];
    if (!t) { refused.push(`${file}: unknown namespace ${ns}`); continue; }
    for (const [key, value] of Object.entries(entries)) {
      const base = t.base.get(key);
      if (typeof base !== 'string') { refused.push(`${ns}:${key} is not a string in en`); continue; }
      if (t.ownKeys.has(key)) { refused.push(`${ns}:${key} already translated, left alone`); continue; }
      if (typeof value !== 'string' || !value.trim() && base.trim()) { refused.push(`${ns}:${key} empty draft`); continue; }
      if (holes(value) !== holes(base)) { refused.push(`${ns}:${key} placeholders differ: "${value}"`); continue; }
      if (/—/.test(value)) { refused.push(`${ns}:${key} has an em-dash: "${value}"`); continue; }
      set(t.own, key, value);
      t.ownKeys.add(key);
      written++;
    }
  }
}

// Re-order every locale file to the base language's key order, so a diff
// reads as a translation and not as a shuffle.
const order = (base, own) => {
  if (!own || typeof own !== 'object') return own;
  const out = {};
  for (const k of Object.keys(base)) {
    if (!(k in own)) continue;
    out[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? order(base[k], own[k]) : own[k];
  }
  return out;
};
for (const ns of ['shared', 'app', 'web']) {
  const base = read(path.join(ROOT, `locales/${ns}/en.json`));
  fs.writeFileSync(
    path.join(ROOT, `locales/${ns}/${locale}.json`),
    JSON.stringify(order(base, targets[ns].own), null, 2) + '\n'
  );
}

console.log(`${written} strings written, ${refused.length} refused.`);
for (const r of refused) console.log('  ' + r);
execSync('node scripts/build.mjs && node scripts/check.mjs', { cwd: ROOT, stdio: 'inherit' });
