// Build the per-target bundles.
//
// locales/shared holds strings both products show on the same screen, stored
// once under a canonical key. meta/aliases.json says where each product reads
// that string from, so the value is translated once and neither product has to
// change its call sites. locales/app and locales/web hold everything else.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LOCALES = ['en', 'fi'];
const TARGETS = ['app', 'web'];

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, p, v) => {
  const ks = p.split('.');
  const last = ks.pop();
  let cur = o;
  for (const k of ks) cur = (cur[k] ??= {});
  cur[last] = v;
};

export function bundle(target, locale) {
  const aliases = read('meta/aliases.json');
  const shared = read(`locales/shared/${locale}.json`);
  const out = read(`locales/${target}/${locale}.json`);

  for (const key of Object.keys(aliases)) {
    if (key === '_comment') continue;
    const value = get(shared, key);
    if (value === undefined) throw new Error(`shared key missing: ${key} (${locale})`);
    for (const p of [aliases[key][target]].flat()) set(out, p, value);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  for (const target of TARGETS) {
    for (const locale of LOCALES) {
      const data = bundle(target, locale);
      fs.writeFileSync(
        path.join(ROOT, `dist/${target}.${locale}.json`),
        JSON.stringify(data, null, 2) + '\n'
      );
    }
  }
  console.log(`built ${TARGETS.length * LOCALES.length} bundles into dist/`);
}
