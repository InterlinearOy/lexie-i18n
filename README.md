# lexie-i18n

Every Lexie UI string, for every language, in one place. The mobile app and the
web product both read from here.

Before this repo existed each product kept its own catalog. The same sentence
lived in two places, the two copies had already drifted, and adding a language
meant translating that sentence twice with no way to tell it was the same
sentence. One catalog fixes all three.

## Layout

```
locales/shared/   strings both products show on the same screen
locales/app/      mobile only: scanPage, occlusion, focusMode, notifications, ...
locales/web/      web only: landing page, pricing, creator program, ...
meta/aliases.json where each product reads a shared string from
meta/screens.json which screen each string appears on, in reading order
meta/glossary.json product nouns and the voice rules, per language
dist/             the built bundles, committed so installing needs no build step
```

## Why aliases

The two products already read these strings from different key paths. The app
reads `quiz.feedback.correct`; the web reads `study.quiz.correct`. Rather than
rename every call site in both codebases, `meta/aliases.json` records both
paths against one canonical shared key. The build projects the value into each
path, so a string is translated once and neither product changes.

Where the two products said different things, the app wording won. Decided by
Elina on 2026-08-28. `meta/merge-report.json` lists every string that changed
as a result.

## Working on it

```bash
npm run build   # regenerate dist/ from locales/
npm run check   # key parity, placeholder parity, and whether dist/ is stale
```

`npm run check` must pass before you commit. It is what stops a locale quietly
losing a key or a translation dropping a `{count}`.

## Languages

`meta/locales.json` lists them and says how far each has got.

A `complete` locale carries every key. An `inProgress` locale carries only what
has been translated so far; the build fills the rest from the base language, so
a half-translated language shows English rather than raw key paths. It may never
carry a key the base lacks, because that is a typo or a key nothing reads any
more. `npm run check` enforces both rules and prints the progress of every
in-progress locale.

To add one:

1. Add it to `meta/locales.json` with `"status": "inProgress"`.
2. Create empty `locales/*/<code>.json` files and translate into them.
3. `npm run build && npm run check`
4. Widen the language union in each product and add the locale to its picker.
5. Flip it to `complete` once `npm run check` reports 100%.

## Consuming it

Both products depend on this repo by tag:

```json
"@lexie/i18n": "github:InterlinearOy/lexie-i18n#v1.0.0"
```

The tag matters. The web deploys continuously while the app ships through App
Store review, so an unpinned catalog change could land in a binary that is
already in review.

Import the built bundle by path. Do not add an `exports` map: Metro does not
resolve subpath exports without an unstable flag, and a map would also block
these deep imports.

```ts
import en from '@lexie/i18n/dist/app.en.json';   // lexie-app
import en from '@lexie/i18n/dist/web.en.json';   // lexie-web
```

Each product keeps its own type for the catalog. `lexie-web` compiles the JSON
against `src/translations.types.ts`, so a key disappearing from the catalog
breaks the build there rather than at runtime.

## Rules

- Catalog entries are plain data. No functions. Counts are `{count}` templates,
  with a separate singular and plural entry where the language inflects the
  noun.
- Routes are not copy. `'/fi'` is a destination, not a sentence, and it never
  goes in here. A translator must never be handed a URL.
- `scripts/split.mjs` was the one-time import from the old per-product
  catalogs. It is kept as history and no longer runs; `locales/` is the source
  of truth now.
