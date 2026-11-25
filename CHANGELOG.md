# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-11-25

### Added

- Spotify as an experimental source (Authorization Code + PKCE, own Client ID,
  no client secret).
- Source and genre-provider interfaces; Yandex Music moved into an adapter.
- Export the cloud as SVG and PNG in addition to JSON.
- Demo mode with a fictional library, English and Russian UI.
- Discogs personal token setting; higher rate limit when a token is present.
- Pause/resume, group-level progress and an ETA estimate.
- Negative cache (30 days) for groups the catalogs had no genres for.
- Genre synonym normalization (`hip hop`/`hip-hop`, `synthpop`/`synth-pop`, …).
- Local Inter Variable font (OFL) instead of the system font stack.
- Documentation: privacy policy, permissions, performance benchmark, store
  listing draft, architecture decisions and contribution guides.
- CI and release workflows.

### Changed

- Project renamed to **GenreCloud**.
- Interface rebuilt: warm paper palette, multi-hue genre cloud, serif display
  headings with italic words, compact radii; dark theme via
  `prefers-color-scheme`, en/ru i18n.
- Lookup is grouped by artist+album: one catalog request per group instead of
  one per track. Discogs and MusicBrainz queues run in parallel.
- MusicBrainz genres are read from search tags, without a second lookup.
- Rate limiting now honours `Retry-After` and Discogs rate-limit headers and
  uses exponential backoff on 429/503.
- Permissions narrowed and documented; strict extension-page CSP.
- Packaging is reproducible (sorted files, fixed timestamps, SHA-256 file).

### Removed

- Tailwind CSS, all Radix/shadcn components and unused dependencies.
- Popup entry point (the app opens in a full tab so a long lookup is not
  interrupted by losing focus).

### Performance

- Benchmark: 686-track library, 32.4 min (per-track baseline) →
  8.7 min (grouped), 3.74× faster; Discogs requests 686 → 209.

### Security

- No remote code, `eval` or third-party scripts.
- Tokens are stored only in `storage.local`, never logged or exported.
- Yandex Music collection stops on 401/403/429 with a clear message.

## [1.0.0] - 2025-11-20

### Added

- Initial release: Yandex Music likes, instant album genres, Discogs and
  MusicBrainz refinement, word cloud, JSON export, Chrome and Firefox builds.
