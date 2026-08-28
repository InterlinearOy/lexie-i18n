// Build the data the review page renders: every string that has a German draft,
// with both reference languages, its screen, and the checks a script can run so
// the reviewer never spends attention on them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle, BASE } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p + k + '.') : [[p + k, v]]
  );
const holes = (s) =>
  typeof s === 'string' ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]) : [];

const glossary = read('meta/glossary.json');
// Where each string sits in the product, hand-written. See meta/context.json
// for why this is not derived from the code.
const context = read('meta/context.json');
const flowOrder = new Map(context.flows.map((f, i) => [f.id, i]));

const rows = [];
const seen = new Set();

for (const target of ['app', 'web']) {
  const en = new Map(flat(bundle(target, BASE)));
  const fi = new Map(flat(bundle(target, 'fi')));
  const de = new Map(flat(bundle(target, 'de')));

  for (const [key, enVal] of en) {
    const deVal = de.get(key);
    // Only strings that actually have a German draft. Everything else is still
    // falling back to English and is not ready to be judged.
    if (typeof deVal !== 'string' || deVal === enVal) continue;
    // A shared string appears in both bundles; show it once.
    if (seen.has(deVal + '|' + enVal)) continue;
    seen.add(deVal + '|' + enVal);

    const enHoles = holes(enVal);
    const deHoles = holes(deVal);
    const ctx = context.strings[key];
    if (!ctx) throw new Error(`no context written for ${key} — add it to meta/context.json`);
    rows.push({
      key,
      target,
      flow: ctx.flow,
      role: context.roles[ctx.role],
      note: ctx.note,
      order: flowOrder.get(ctx.flow) ?? 1e9,
      en: enVal,
      fi: fi.get(key) ?? '',
      de: deVal,
      // German runs roughly 30% longer than English. The budget is a nudge to
      // propose something shorter during review, not after QA finds a clipped
      // button.
      budget: Math.max(24, Math.round(enVal.length * 1.3)),
      placeholders: enHoles,
      placeholdersOk:
        enHoles.slice().sort().join(',') === deHoles.slice().sort().join(','),
    });
  }
}

rows.sort((a, b) => a.order - b.order);

const terms = Object.entries(glossary.terms)
  .filter(([, v]) => v.deStatus === 'proposed')
  .map(([id, v]) => ({ id, en: v.en, fi: v.fi, de: v.de, note: glossary.openQuestions?.[id] ?? null }));

const out = {
  flows: context.flows,
  addressForm: glossary._addressForm.de,
  voice: glossary.voice.de,
  terms,
  rows,
};
fs.writeFileSync(path.join(ROOT, 'meta/review-data.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`${rows.length} strings across ${new Set(rows.map((r) => r.flow)).size} flows, ${terms.length} glossary terms`);
