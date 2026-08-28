// Fail loudly on the three ways this catalog can rot:
//   1. a locale is missing a key another locale has
//   2. a string loses or invents a {placeholder} in translation
//   3. dist/ no longer matches locales/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle, LOCALES } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'en';
const problems = [];

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

if (problems.length) {
  console.error(`${problems.length} problem(s):`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('catalog ok: key parity, placeholder parity, dist up to date');
