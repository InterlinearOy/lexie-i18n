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
// The store listing is translatable text that never ships inside a bundle, so
// it lives in meta rather than locales. It goes first: the name and subtitle
// are the highest-traffic strings there are, and Apple's 30-character cap is
// hard, which makes them the sharpest test of writing short in German.
const store = read('meta/store.json');
const flowOrder = new Map(context.flows.map((f, i) => [f.id, i]));

const rows = [];
const seen = new Set();
const unbriefed = [];

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
    // A string with no context written is left out of the review rather than
    // shown without one. The reviewer cannot judge a button she cannot place,
    // and a pass should not quietly swell as features land. They are listed at
    // the end so nothing goes missing silently.
    const ctx = context.strings[key];
    if (!ctx) { unbriefed.push(`${target}:${key}`); continue; }
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

// German drafts for the store fields live alongside the rest, keyed by id.
const storeDe = read('locales/shared/de.json').store ?? {};
for (const f of [...store.fields].reverse()) {
  const key = f.id.split('.')[1];
  rows.unshift({
    key: f.id,
    target: 'store',
    flow: 'store',
    role: f.role,
    note: f.note,
    en: f.en,
    fi: f.fi,
    de: storeDe[key] ?? f.en,
    // Apple's hard limit, not the usual 30% allowance.
    budget: f.limit,
    placeholders: [],
    placeholdersOk: true,
    order: -1,
  });
}

rows.sort((a, b) => a.order - b.order);

const terms = Object.entries(glossary.terms)
  .filter(([, v]) => v.deStatus === 'proposed')
  .map(([id, v]) => ({ id, en: v.en, fi: v.fi, de: v.de, note: glossary.openQuestions?.[id] ?? null }));

const out = {
  flows: [
    { id: 'store', name: 'Store-Eintrag',
      when: 'Name und Untertitel im App Store und bei Google Play. Das Erste, was jemand von Lexie sieht, und beides hart auf 30 Zeichen begrenzt. Apple lehnt längere Texte ab, sie werden nicht nur abgeschnitten.' },
    ...context.flows,
  ],
  addressForm: glossary._addressForm.de,
  voice: glossary.voice.de,
  terms,
  rows,
};
fs.writeFileSync(path.join(ROOT, 'meta/review-data.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`${rows.length} strings across ${new Set(rows.map((r) => r.flow)).size} flows, ${terms.length} glossary terms`);
if (unbriefed.length) {
  console.log(`\n${unbriefed.length} translated strings are NOT in this review, because meta/context.json`);
  console.log('does not say where they appear. Add them there to include them:');
  for (const k of unbriefed) console.log('  ' + k);
}
