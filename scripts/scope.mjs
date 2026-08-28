// The size of the translation job, for quoting.
//
// A shared string is projected into BOTH product bundles at each product's own
// key path, so adding the two bundle counts together counts it twice. Quote
// from the deduplicated number or you are paying for the same sentence twice.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle, BASE } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aliases = JSON.parse(fs.readFileSync(path.join(ROOT, 'meta/aliases.json'), 'utf8'));

const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p + k + '.') : [[p + k, v]]
  );
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

const sharedPaths = { app: new Set(), web: new Set() };
for (const [key, v] of Object.entries(aliases)) {
  if (key === '_comment') continue;
  sharedPaths.app.add(v.app);
  for (const w of [v.web].flat()) sharedPaths.web.add(w);
}

const strings = (target) => flat(bundle(target, BASE)).filter(([, v]) => typeof v === 'string');
const app = strings('app');
const web = strings('web');

const groups = {
  shared: app.filter(([k]) => sharedPaths.app.has(k)),
  app: app.filter(([k]) => !sharedPaths.app.has(k)),
  web: web.filter(([k]) => !sharedPaths.web.has(k)),
};
const all = [...groups.shared, ...groups.app, ...groups.web];

const line = (label, rows) =>
  `  ${label.padEnd(18)}${String(rows.length).padStart(5)} strings ${String(rows.reduce((n, [, v]) => n + words(v), 0)).padStart(6)} words`;

console.log('Translation scope, each string counted once:');
console.log(line('shared by both', groups.shared));
console.log(line('app only', groups.app));
console.log(line('web only', groups.web));
console.log('  ' + '-'.repeat(44));
console.log(line('total', all));
console.log();
console.log(`  ${all.reduce((n, [, v]) => n + String(v).length, 0).toLocaleString('en-US')} characters including spaces`);
console.log(`  ${all.filter(([, v]) => words(v) <= 3).length} strings are three words or fewer`);
console.log(`  ${all.filter(([, v]) => words(v) > 25).length} strings run over 25 words`);
console.log();
console.log(`  counting the bundles separately would say ${app.length + web.length} strings,`);
console.log(`  double-counting the ${groups.shared.length} shared ones.`);
