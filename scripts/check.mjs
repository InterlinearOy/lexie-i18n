// Fail loudly on the three ways this catalog can rot:
//   1. a locale is missing a key another locale has
//   2. a string loses or invents a {placeholder} in translation
//   3. dist/ no longer matches locales/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle, LOCALES, BASE, isComplete } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

// A locale still being translated is allowed to be a subset of the base: the
// build fills the gaps and the reader sees the base language. What it may never
// have is a key the base lacks, because that is a typo or a renamed key that
// nothing reads any more.
function checkRawKeys(locale) {
  for (const ns of ['shared', 'app', 'web']) {
    const own = JSON.parse(fs.readFileSync(path.join(ROOT, `locales/${ns}/${locale}.json`), 'utf8'));
    const base = JSON.parse(fs.readFileSync(path.join(ROOT, `locales/${ns}/${BASE}.json`), 'utf8'));
    const baseKeys = new Set(flat(base).map(([k]) => k));
    for (const [k] of flat(own)) {
      if (!baseKeys.has(k)) problems.push(`locales/${ns}/${locale}.json: key not in ${BASE}: ${k}`);
    }
  }
}

const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p + k + '.') : [[p + k, v]]
  );
const placeholders = (s) =>
  typeof s === 'string' ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort() : [];

for (const target of ['app', 'web']) {
  const base = new Map(flat(bundle(target, BASE)));

  for (const locale of LOCALES) {
    if (locale === BASE) continue;
    const other = new Map(flat(bundle(target, locale)));

    for (const k of base.keys()) {
      if (!other.has(k)) problems.push(`${target}/${locale}: missing key ${k}`);
    }
    for (const k of other.keys()) {
      if (!base.has(k)) problems.push(`${target}/${BASE}: missing key ${k}`);
    }
    // Placeholders are checked below against the bundle, which for an
    // in-progress locale is mostly base text; that still catches a bad
    // translation the moment it is written.
    for (const [k, v] of base) {
      if (!other.has(k)) continue;
      const a = placeholders(v).join(',');
      const b = placeholders(other.get(k)).join(',');
      if (a !== b) problems.push(`${target}/${locale}: ${k} placeholders "${b}" should be "${a}"`);
    }
  }

  for (const locale of LOCALES) {
    const built = JSON.stringify(bundle(target, locale), null, 2) + '\n';
    const onDisk = fs.readFileSync(path.join(ROOT, `dist/${target}.${locale}.json`), 'utf8');
    if (built !== onDisk) problems.push(`dist/${target}.${locale}.json is stale — run npm run build`);
  }
}

for (const locale of LOCALES) {
  if (locale !== BASE && !isComplete(locale)) checkRawKeys(locale);
}

// Report how far each in-progress locale has got, so nobody has to guess.
for (const locale of LOCALES) {
  if (locale === BASE || isComplete(locale)) continue;
  let done = 0, total = 0;
  for (const target of ['app', 'web']) {
    const b = new Map(flat(bundle(target, BASE)));
    const t = new Map(flat(bundle(target, locale)));
    // Compare by value: array-valued entries would never be equal by identity.
    for (const [k, v] of b) { total++; if (JSON.stringify(t.get(k)) !== JSON.stringify(v)) done++; }
  }
  console.log(`${locale}: ${done}/${total} strings translated ` +
              `(${Math.round((done / total) * 100)}%), the rest falls back to ${BASE}`);
}

if (problems.length) {
  console.error(`${problems.length} problem(s):`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('catalog ok: key parity, placeholder parity, dist up to date');
