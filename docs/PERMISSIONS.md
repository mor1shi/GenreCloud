# Permissions

GenreCloud asks for the smallest set of browser permissions that still lets it
read your own library and query public music catalogs. Every permission is
listed here with the reason it is needed. There are no optional permissions at
runtime that silently expand this list.

## `permissions`

| Permission              | Why it is needed                                                                                                                                | What it does **not** do                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `storage`               | Saves the collected library, settings, lookup cache and (if you connect Spotify) OAuth tokens in `storage.local`.                               | Nothing is synced to a cloud account and nothing leaves the browser.                                  |
| `tabs`                  | Finds an open Yandex Music tab and opens the GenreCloud tab from the toolbar button.                                                            | Tab URLs are read only to match `music.yandex.*`; no history is collected.                            |
| `scripting`             | Injects the library reader into the Yandex Music page (`world: MAIN`) so requests use that page's own session cookies.                          | No script is injected into any other site.                                                            |
| `declarativeNetRequest` | Appends a contact suffix to the `User-Agent` for MusicBrainz and Discogs requests (`rules.json`). Both services require an identifiable client. | No requests are blocked, redirected or rewritten; only a header value is appended on those two hosts. |
| `identity`              | Spotify Authorization Code + PKCE flow via `identity.launchWebAuthFlow`.                                                                        | Only used when you explicitly connect Spotify. There is no client secret in the extension.            |

## `host_permissions`

| Host                                                              | Why                                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `https://music.yandex.ru/*`, `.com`, `.kz`, `.by`                 | The content script that reads "liked" tracks runs on these pages.      |
| `https://api.music.yandex.ru/*`, `https://api.music.yandex.net/*` | The page-world reader calls the same internal API the web player uses. |
| `https://musicbrainz.org/*`                                       | Genre/tag search.                                                      |
| `https://api.discogs.com/*`                                       | Release styles and genres.                                             |
| `https://accounts.spotify.com/*`                                  | PKCE token exchange (only when Spotify is enabled).                    |
| `https://api.spotify.com/*`                                       | Saved tracks and artist genres (only when Spotify is enabled).         |

## Content Security Policy

`extension_pages` is locked down to:

```
default-src 'self'; script-src 'self'; object-src 'none';
connect-src 'self' https://api.music.yandex.ru https://api.music.yandex.com
  https://api.music.yandex.net https://musicbrainz.org https://api.discogs.com
  https://api.spotify.com https://accounts.spotify.com;
img-src 'self' data: blob:; style-src 'self' 'unsafe-inline';
base-uri 'none'; form-action 'none'
```

- No remote scripts, `eval`, `new Function` or dynamic `import()` of remote code.
- `style-src` allows inline styles because React sets layout styles on the word
  cloud; no stylesheet is loaded from the network.
- Fonts are the system stack; nothing is fetched from a CDN.

## User-Agent header

`rules.json` appends `GenreCloud/1.1.0 (+https://github.com/mor1shi/GenreCloud)`
to requests matching:

- `||musicbrainz.org/ws/2/`
- `||api.discogs.com/database/`

Firefox supports `declarativeNetRequest` with `modifyHeaders` since version 113,
and host permissions for the request URL are present, so the same rule file is
shipped in the Firefox build.

### Manual verification

Browser-level header inspection cannot be automated in this repository without
a real browser profile. To verify:

1. Build and load the extension (`npm run build`).
2. Open the cloud tab, add a few demo tracks and start a lookup.
3. In DevTools → Network, open a `musicbrainz.org` request and a
   `api.discogs.com` request.
4. Confirm the `User-Agent` request header ends with
   `GenreCloud/1.1.0 (+https://github.com/mor1shi/GenreCloud)`.

Repeat in Firefox (`about:debugging`) — the DNR rule is part of the Firefox
manifest, not only the Chrome one.
