# GenreCloud — release plan

Status: in progress. Branch: `release-prep`. Nothing is pushed or published.

## Baseline (measured before any change)

| Metric | Value |
| --- | --- |
| Bundle JS | 396 889 B (127 084 B gzip) |
| Bundle CSS | 85 461 B (16 170 B gzip) |
| `dist/public` | ~680 KB |
| Chrome ZIP | 152 104 B |
| Firefox ZIP | 151 747 B |
| Direct dependencies | 0 |
| Dev dependencies | 58 |
| `src/components` files | 56 (55 shadcn/Radix primitives) |
| Full lookup pass, 686 tracks | ~30–35 min (measured in Firefox) |
| Modeled requests for 686 tracks | 686 Discogs (2.7 s each) + 137 MusicBrainz (1.5 s each), sequential ≈ 34 min |

Baseline is modeled in `bench/baseline.ts` using the same fixture as the new
engine, so "before" and "after" use identical input and identical service
limits.

## Problems to fix

1. Name and identity are tied to Yandex Music and read like a landing page.
2. UI is decorative: marketing copy, random colors, mixed typefaces, shadows,
   large radii, unused shadcn components and 58 dev dependencies.
3. Lookups are per track, sequential, and not deduplicated by artist/album.
4. No source/provider abstraction, no Spotify, no tests, no linter, no CI.
5. Storage schema has no migration path; export name is Yandex-specific.

## Target architecture

```
src/lib/
  music.ts              types, normalization, genre aggregation
  settings.ts           settings model + storage migration
  storage.ts            storage abstraction (extension / dev fallback)
  i18n/                 en + ru dictionaries
  sources/
    types.ts            MusicSource, GenreProvider contracts
    yandex/             content-script adapter (behavior unchanged)
    spotify/            PKCE auth, Web API client, source + provider
  providers/            discogs.ts, musicbrainz.ts
  lookup/
    rate-limiter.ts     token/interval limiter, Retry-After, backoff
    groups.ts           artist/album grouping, priority order
    engine.ts           two parallel queues, negative cache, pause/resume
    negative-cache.ts   30-day TTL "not found" cache
  export/               json, svg, png renderers
  demo.ts               fictional library for screenshots and offline demo
src/components/         only components used by the app
public/                 manifest, background, content, rules
bench/                  virtual-clock benchmark, mock servers
```

## Stages and acceptance criteria

### Stage 1 — rename to GenreCloud
Manifest, UI, titles, package name, ZIP names, UA
(`GenreCloud/<version> (+repo URL)`), export file name
(`genrecloud-export.json`), neutral Gecko id. Storage key stays
`genre-cloud-library-v1` behind a schema/migration layer. No "Yandex" or
"Spotify" in the product name or artwork.

Acceptance: no old names outside migration/compat code; typecheck and build
pass.

### Stage 2 — utilitarian redesign
Neutral palette + one accent, dark theme, one typeface, mono for numbers,
single-hue cloud scale, ≤6 px radii, 1 px borders, no shadows/blur, English
default with Russian switcher, demo data, JSON/SVG/PNG export, keyboard
access, 360–1280 px layouts.

Acceptance: screenshots (light/dark, 360/1280) compared against the
"AI look" checklist; `src/components` contains only used components.

### Stage 3 — faster lookups
Group by artist+album and artist, two parallel rate-limited queues, optional
Discogs token (25→60 rpm), MusicBrainz tags from search, priority by group
size, 1 s UI throttle, 30-day negative cache, local-only caches.

Acceptance: benchmark on identical fixtures shows ≥3× fewer virtual seconds
than baseline; request counts recorded in `docs/PERFORMANCE.md`.

### Stage 4 — source/provider interfaces
`MusicSource` and `GenreProvider` contracts; Yandex moved into an adapter
without behavior change; Spotify isolated in its own folder; each source can
be disabled in settings.

### Stage 5 — Spotify (experimental)
Authorization Code + PKCE via `identity.launchWebAuthFlow`, user-supplied
Client ID, tokens only in `storage.local`, 50-item pagination through saved
tracks, per-artist `genres` with fallback, contract tests against a local
mock server. Marked experimental in UI and README; no logo, no brand green.

### Stage 6 — security and service etiquette
Minimal permissions with rationale, strict CSP, no remote code, UA verified
in both browsers (DNR kept in the Firefox build), clear error handling for
401/403/429, no credentials in logs.

### Stage 7 — quality
Pause/resume with ETA, diagnostics copy without personal data, delete-all,
genre synonym normalization, top-N selector, Vitest coverage of core logic,
ESLint + Prettier, reproducible packaging with SHA-256.

### Stage 8 — repository preparation
Secret/personal-data scan (tree and history), license and third-party
notices, README (en/ru), PRIVACY, CONTRIBUTING, CoC, SECURITY, CHANGELOG,
issue/PR templates, CI and release workflows, store listing draft,
`PUBLISH-CHECKLIST.md`.

## Risks and open questions

- Spotify Developer Policy III.13 restricts analysing Spotify content and
  building user profiles. Our genre statistics may fall under it; quoted in
  `PUBLISH-CHECKLIST.md` as an open legal question, not "resolved".
- Spotify `genres` on artist objects is deprecated and often empty; Discogs
  and MusicBrainz remain the reliable sources.
- Yandex Music is read through an unofficial internal API; it can change or
  disappear. Not affiliated, personal non-commercial use only.
- Name availability and trademark checks are user decisions.
- No live Spotify account is available: the module is verified against mocks
  only and labelled experimental.
