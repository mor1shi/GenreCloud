# Privacy

GenreCloud runs entirely in your browser. There is no backend, no account, no
telemetry and no analytics.

## What is stored locally

Everything below lives in `storage.local` of the extension and never syncs to a
cloud account:

| Key                            | Contents                                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| `genre-cloud-library-v1`       | Collected tracks and genre results, with a schema version.          |
| `genrecloud-settings-v1`       | Language, top-N, enabled sources, Discogs token, Spotify Client ID. |
| `genrecloud-negative-cache-v1` | Groups the catalogs had no genres for (30-day TTL).                 |
| `genrecloud-spotify-tokens-v1` | Spotify access and refresh tokens, only if you connect Spotify.     |

The Discogs token and Spotify tokens are never included in JSON exports, logs
or diagnostics, and the Spotify Client ID is not a secret (PKCE is used, there
is no client secret).

## What leaves your browser

| Destination                 | Data                                          | Why                                         |
| --------------------------- | --------------------------------------------- | ------------------------------------------- |
| `music.yandex.*` (same tab) | Your own library request via the page session | Read tracks you liked                       |
| `api.discogs.com`           | Artist, album and (for singles) track title   | Look up release styles                      |
| `musicbrainz.org`           | Artist, album and track title                 | Look up genres and tags                     |
| `accounts.spotify.com`      | PKCE authorization code and tokens            | Connect Spotify, only if you enable it      |
| `api.spotify.com`           | Saved-tracks pages and artist ids             | Read your Spotify library and artist genres |

No cookies, session tokens or account identifiers are sent to Discogs,
MusicBrainz or any other third party. No requests go to advertising, analytics
or CDN domains, and no external fonts or scripts are loaded.

## Retention and deletion

Data stays until you delete it. Two ways to remove everything:

1. **Delete local data** in the app: removes the library, settings, negative
   cache and Spotify tokens.
2. Remove the extension: the browser deletes its storage.

Exported files (JSON, SVG, PNG) are written to your downloads folder by you;
GenreCloud has no access to them afterwards.

## Diagnostics

The "Copy diagnostics" button produces a short report: app version, counts of
tracks and genres, error messages from catalogs, browser user agent. It does
not include track names, artists, account ids, tokens or the Discogs token.

## Third-party data

Exported genre data is derived from Discogs and MusicBrainz. If you publish an
export, you are responsible for complying with their terms and licenses. See
`THIRD_PARTY_NOTICES.md`.
