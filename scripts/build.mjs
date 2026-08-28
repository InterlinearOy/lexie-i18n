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
const TARGETS = ['app', 'web'];

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'meta/locales.json'), 'utf8'));
export const BASE = meta.base;
export const LOCALES = Object.keys(meta.locales);
export const isComplete = (locale) => meta.locales[locale].status === 'complete';
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, p, v) => {
  const ks = p.split('.');
  const last = ks.pop();
  let cur = o;
  for (const k of ks) cur = (cur[k] ??= {});
  cur[last] = v;
};

// Deep-merge `over` on top of `base`, so a locale that has translated only part
// of the catalog still returns a complete bundle. Anything not yet translated
// shows the base language rather than a raw key path.
function mergeOver(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base?.[k]
      ? mergeOver(base[k], v)
      : v;
  }
  return out;
}

export function bundle(target, locale) {
  const aliases = read('meta/aliases.json');
  const build = (loc) => {
    const shared = read(`locales/shared/${loc}.json`);
    const out = read(`locales/${target}/${loc}.json`);
    for (const key of Object.keys(aliases)) {
      if (key === '_comment') continue;
      const value = get(shared, key);
      if (value === undefined) continue;
      for (const p of [aliases[key][target]].flat()) set(out, p, value);
    }
    return out;
  };

  const own = build(locale);
  return isComplete(locale) ? own : mergeOver(build(BASE), own);
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
