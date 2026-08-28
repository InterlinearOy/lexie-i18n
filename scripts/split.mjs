// One-time import: read the two existing catalogs and split them into
// locales/shared, locales/app and locales/web. Run once; after that the
// locales/ tree is the source of truth and this script is history.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WS = path.resolve(ROOT, '..');
const LOCALES = ['en', 'fi'];

const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, p, v) => {
  const ks = p.split('.');
  const last = ks.pop();
  let cur = o;
  for (const k of ks) cur = (cur[k] ??= {});
  cur[last] = v;
};
const unset = (o, p) => {
  const ks = p.split('.');
  const last = ks.pop();
  let cur = o;
  for (const k of ks) { if (cur == null) return; cur = cur[k]; }
  if (cur) delete cur[last];
};
const prune = (o) => {
  for (const k of Object.keys(o)) {
    if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) {
      prune(o[k]);
      if (Object.keys(o[k]).length === 0) delete o[k];
    }
  }
  return o;
};

// The web catalog is TypeScript, so transpile it to read the values out.
function readWeb(locale) {
  const ts = require(path.join(WS, 'lexie-web/node_modules/typescript'));
  const file = path.join(WS, `lexie-web/src/translations.${locale}.ts`);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', js)(m, m.exports, () => ({}));
  return m.exports[locale];
}

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const aliases = JSON.parse(fs.readFileSync(path.join(ROOT, 'meta/aliases.json'), 'utf8'));
const aliasKeys = Object.keys(aliases).filter((k) => k !== '_comment');

const report = [];

for (const locale of LOCALES) {
  const app = JSON.parse(
    fs.readFileSync(path.join(WS, `lexie-app/src/i18n/locales/${locale}.json`), 'utf8')
  );
  const web = readWeb(locale);

  const shared = {};
  for (const key of aliasKeys) {
    const { app: appPath } = aliases[key];
    const webPaths = [aliases[key].web].flat();
    const appVal = get(app, appPath);
    if (appVal === undefined) throw new Error(`app path missing: ${appPath} (${locale})`);
    // The app wording wins wherever the two disagreed.
    set(shared, key, appVal);
    for (const webPath of webPaths) {
      const webVal = get(web, webPath);
      if (webVal === undefined) throw new Error(`web path missing: ${webPath} (${locale})`);
      if (appVal !== webVal) report.push({ locale, key, webPath, was: webVal, now: appVal });
      unset(web, webPath);
    }
    unset(app, appPath);
  }

  fs.writeFileSync(path.join(ROOT, `locales/shared/${locale}.json`),
    JSON.stringify(shared, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, `locales/app/${locale}.json`),
    JSON.stringify(prune(app), null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, `locales/web/${locale}.json`),
    JSON.stringify(prune(web), null, 2) + '\n');
}

fs.writeFileSync(path.join(ROOT, 'meta/merge-report.json'),
  JSON.stringify(report, null, 2) + '\n');

console.log(`split ${aliasKeys.length} shared keys`);
console.log(`web copy changes: ${report.filter((r) => r.locale === 'en').length} en, ` +
            `${report.filter((r) => r.locale === 'fi').length} fi`);
