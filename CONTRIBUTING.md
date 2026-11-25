# Contributing

Thanks for taking a look. Small, focused pull requests are the easiest to
review.

## Setup

```bash
npm ci
npm run dev        # Vite dev server, demo data works without an extension
npm run typecheck
npm run lint
npm test
npm run build      # dist/public (Chrome), dist/firefox, ZIPs + SHA-256
```

Node.js 20 or newer is required. The project uses strict TypeScript, ESLint and
Prettier; run `npm run format` before committing if your editor does not.

## Before opening a PR

- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` must pass.
- Add or update tests for logic changes (lookup engine, rate limiter, providers,
  normalization, storage migration).
- Keep the UI text in both `en` and `ru` dictionaries (`src/lib/i18n.ts`).
- Do not include real library exports, account ids, cookies, tokens or
  screenshots of a personal library. Use the demo mode.
- One logical change per commit. Conventional Commits are preferred
  (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `perf:`).

## Adding a source or provider

A music source implements `MusicSource` (`src/lib/sources/types.ts`) and returns
`Track[]`. A genre provider implements `GenreProvider` and returns `GenreHit[]`
for one artist/album group. Keep provider code independent from React and from
browser globals so it can be tested with a mock `fetch`.

Respect the service limits: MusicBrainz at most one request per second with an
identifying User-Agent, Discogs 25 requests/minute without a token (60 with a
token), and Spotify's `Retry-After`. Do not add scraping or undocumented
endpoints.

## Reporting bugs

Use the issue templates. A bug report without reproduction steps on demo data
is hard to act on. Security issues go through `SECURITY.md`, not the public
tracker.
