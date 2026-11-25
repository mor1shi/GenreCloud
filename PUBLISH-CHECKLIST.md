# Publish checklist

State as of 2026-11-25, branch `release-prep`. Nothing has been pushed or
published.

## Done

- [x] Renamed to **GenreCloud** everywhere (UI, manifests, package name, ZIP
      names, User-Agent, export filenames). Storage key kept, schema migration
      added (`src/lib/storage-migration.ts`).
- [x] New utilitarian UI: neutral palette, one accent, system/Inter font,
      ≤ 6 px radii, no gradients, shadows or decorative labels; dark theme via
      `prefers-color-scheme`; en default + ru, switch in Settings.
- [x] Cloud: size and single-hue intensity by frequency (log scale, stated in
      the legend), keyboard accessible, click filters the track list.
- [x] Demo mode with a fictional library; all README screenshots use it.
- [x] Exports: JSON, SVG, PNG.
- [x] Grouped lookup by artist+album, parallel Discogs/MusicBrainz queues,
      shared rate limiters with `Retry-After`/`x-discogs-ratelimit`, backoff on
      429/503, optional Discogs token, negative cache (30 days, local only).
- [x] Benchmark: 686 tracks, 32.4 min baseline → 8.7 min grouped, **3.74×**,
      Discogs requests 686 → 209 (`docs/PERFORMANCE.md`).
- [x] `MusicSource` / `GenreProvider` interfaces; Yandex adapter; Spotify
      isolated under `src/lib/sources/spotify/`.
- [x] Spotify: Authorization Code + PKCE, own Client ID, no client secret,
      tokens only in `storage.local`, Disconnect, pagination/401/429 contract
      tests against a local mock server.
- [x] Security: strict extension CSP, minimal permissions with
      `docs/PERMISSIONS.md`, no remote code/`eval`, no third-party scripts or
      fonts, Yandex collection stops on 401/403/429.
- [x] Firefox keeps the DNR User-Agent rule (MDN confirms `modifyHeaders` with
      host permissions); background stays `scripts`, not a service worker.
- [x] Quality gates green: `npm run lint`, `format:check`, `typecheck`,
      `npm test` (27 tests), `npm run build`.
- [x] Reproducible packaging: sorted files, fixed `SOURCE_DATE_EPOCH`,
      `dist/SHA256SUMS.txt`; two builds produced identical hashes.
- [x] Secret scan: gitleaks 8.30.1 `dir` and `git` scans — no leaks (7 commits).
- [x] Name availability checked (2026-11-25): npm `genrecloud` → 404; AMO search
      → 0 results; Chrome Web Store (RU storefront) → no results; GitHub API →
      one unrelated repository (`BlackStone314/GenreCloud-Old`).
- [x] Docs: README (en/ru), PRIVACY, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT,
      THIRD_PARTY_NOTICES, CHANGELOG, store listing draft, issue/PR templates,
      CI and release workflows.

## Not verified (cannot be verified here)

- **Spotify on a live account.** No Spotify account was available. Verified
  only against the official response shapes on a mock server: pagination,
  401 → refresh, 429 → `Retry-After`, PKCE URL construction and storage.
  Marked experimental in the README and UI.
- **Actual User-Agent headers on the wire.** The DNR rule is present in both
  builds and matches MDN's requirements, but the final header was not captured
  in Firefox or Chrome. Manual check: open DevTools → Network → request to
  `musicbrainz.org`, confirm the UA ends with
  `GenreCloud/1.1.0 (+https://github.com/mor1shi/GenreCloud)`.
- **Live Yandex Music collection after the rewrite.** The collection code is
  unchanged in behaviour and was tested in the previous release; it was not
  re-run against a real account during this preparation.
- **Store review and signing.** No AMO signing, no Chrome Web Store upload.
- **Trademark clearance.** Not performed; see below.

## Decisions needed from you

1. **License.** MIT is applied (`LICENSE`, `package.json`). Confirm or choose
   another license before publishing.
2. **Trademark check.** This is not a legal clearance. Run the name through
   EUIPO TMview and USPTO TESS/TSDR yourself, including software class 9 and
   music-related classes. The checks above only show that the name is not
   obviously taken on npm, AMO, the Chrome store or GitHub.
3. **Spotify policy III.13.** Exact quote from the Developer Policy:

   > "Do not analyze the Spotify Content or the Spotify Service for any purpose,
   > including without limitation, creating new or derived listenership metrics,
   > benchmarking, functionality, usage statistics, user metrics, or building
   > profiles of users, including for the purpose of targeting them with
   > advertising or marketing."

   GenreCloud builds per-library genre statistics, which a strict reading could
   treat as derived user metrics. Do not treat this as resolved. Options:
   keep Spotify experimental and personal-use only; require users to bring
   their own Client ID (already done); add an explicit notice in the Spotify
   section; or drop the source before a public store release.

4. **Unofficial Yandex Music API.** The integration uses the web player's
   internal endpoints. This may violate Yandex's terms or break without notice.
   Decide whether to keep it in a public listing, describe it as "personal
   use", or ship it out-of-store (GitHub releases only).
5. **Non-commercial data.** MusicBrainz community genres/tags are CC BY-NC-SA;
   Discogs data is bound by its API terms. Confirm the project stays
   non-commercial (no donations tied to the catalog data, no paid builds) and
   that `THIRD_PARTY_NOTICES.md` wording is acceptable.
6. **Repository URL and maintainer identity.** The manifests' User-Agent and
   `package.json` point to `https://github.com/mor1shi/GenreCloud`. Change the
   owner/repo if the final location differs — it appears in DNR rules,
   `package.json`, README badges and the Spotify instructions.
7. **History and first push.** The repository was created fresh in
   `release-prep`; history has 8 commits and no personal data (gitleaks clean).
   Decide whether to keep this history or start with a single initial commit on
   `main`.
8. **Store accounts.** You need developer accounts for AMO and/or Chrome Web
   Store, plus final screenshots and a promo tile if required.

## To publish (manual)

1. Review `git log` and `git diff main` (there is no `main` yet: create it from
   `release-prep` when satisfied).
2. Create the GitHub repository, push, enable Actions; CI must pass.
3. Tag `v1.1.0`; the release workflow attaches both ZIPs and `SHA256SUMS.txt`.
4. For AMO: submit `dist/genrecloud-firefox.zip`, source code archive, privacy
   policy link, and the permission justifications from `docs/STORE-LISTING.md`.
5. For Chrome Web Store: upload `dist/genrecloud-chrome.zip`, fill the privacy
   practices form, attach screenshots, justify each permission.
6. After publishing, ask testers to file the "Spotify test report" issue; keep
   Spotify labelled experimental until at least one live report confirms it.

## Final artifacts (from the last local build)

- Bundle: `app` JS 287.3 kB raw / 91.6 kB gzip, CSS 2.7 kB gzip; `dist/public`
  is 604 kB including fonts and both manifests. Three runtime dependencies
  (React, React DOM, Lucide icons).
- `genrecloud-chrome.zip` — 12 files, SHA-256
  `7697f1a89c640626d6983c432e73c56cf1333a80ab5b983166d8f011c8f5b855`.
- `genrecloud-firefox.zip` — 12 files, SHA-256
  `2ddf4cc2133be8c0b6ad287314eea437637ccd9dc4dc24b49d3b124ca3b91d21`.
  A repeated build produced the same checksums.
- Screenshots in `docs/screenshots/` are all generated from demo data. No
  screenshot of a real library is tracked.
