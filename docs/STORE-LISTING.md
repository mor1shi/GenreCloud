# Store listing drafts

Drafts only. Nothing here has been submitted to Chrome Web Store or AMO.

## Name

**GenreCloud** — genre cloud for your saved music

No "Yandex" or "Spotify" in the product name, icon or store title. Service
names appear only in the description as compatibility notes.

## Short description (132 characters max)

Build a genre cloud from the tracks you saved. Genres from Discogs and
MusicBrainz; Yandex Music supported, Spotify experimental.

## Long description (English)

GenreCloud reads the tracks you saved (liked) in Yandex Music or Spotify and
turns them into a genre cloud. Word size is the number of your saved tracks in
that genre, not play counts.

The first cloud appears immediately, built from album genres. Genre lookup then
runs in the background, one request per artist and album rather than one per
track, with Discogs and MusicBrainz queried in parallel under their published
rate limits. You can pause, resume and close the tab; progress is saved
locally.

Features: click a genre to filter tracks, top-N and sorting, JSON/SVG/PNG
export, English and Russian UI, light and dark theme, demo mode with fictional
data.

Privacy: no backend, no account, no telemetry, no analytics. Your library stays
in the browser. Only artist, album and track title are sent to Discogs and
MusicBrainz. A personal Discogs token is optional. Spotify requires your own
Client ID (PKCE, no client secret) and is currently experimental.

GenreCloud is unofficial and not affiliated with Yandex, Spotify, Discogs or
MetaBrainz.

## Long description (Russian, for AMO / Chrome RU storefront)

GenreCloud собирает облако жанров по сохранённым («любимым») трекам в
Яндекс Музыке или Spotify. Размер слова — число треков этого жанра, а не
количество прослушиваний.

Облако появляется сразу по жанрам альбомов, затем уточняется: один запрос на
пару «исполнитель + альбом», Discogs и MusicBrainz работают параллельно с
соблюдением их лимитов. Поиск можно поставить на паузу, закрыть вкладку и
продолжить позже — прогресс хранится локально.

Есть фильтр по жанру, топ-N, экспорт JSON/SVG/PNG, интерфейс на русском и
английском, светлая и тёмная тема, демо-режим с вымышленной библиотекой.

Приватность: без сервера, аккаунта, телеметрии и аналитики. Библиотека
остаётся в браузере; в Discogs и MusicBrainz уходят только исполнитель, альбом
и название трека. Токен Discogs необязателен. Для Spotify нужен собственный
Client ID (PKCE, без client secret); поддержка экспериментальна.

Проект неофициальный и не связан с Яндексом, Spotify, Discogs и MetaBrainz.

## Category

- Chrome Web Store: Productivity → Tools (secondary: Music)
- AMO: Music

## Permission justifications

Copy-ready texts for the store review forms.

| Permission                                     | Justification                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                      | Saves the collected library, settings and local caches in the browser. No remote storage.                                                               |
| `tabs`                                         | Finds the open Yandex Music tab to read the user's own likes, and opens/focuses the GenreCloud tab.                                                     |
| `scripting`                                    | Injects the collection function into the Yandex Music page so requests use the page's own session.                                                      |
| `identity`                                     | Spotify Authorization Code + PKCE via the browser's identity API. Used only after the user connects Spotify.                                            |
| `declarativeNetRequest`                        | Appends an identifying User-Agent suffix (`GenreCloud/1.1.0 (+repo URL)`) to Discogs/MusicBrainz requests, as their terms require. No request blocking. |
| Host `music.yandex.ru/.com/.kz/.by`            | Read the user's liked tracks from the open player page.                                                                                                 |
| Host `api.music.yandex.ru/.com/.net`           | Same, through the API host that matches the page domain.                                                                                                |
| Host `api.discogs.com`                         | Release styles for artist/album groups.                                                                                                                 |
| Host `musicbrainz.org`                         | Genres and tags for artist/album groups.                                                                                                                |
| Host `api.spotify.com`, `accounts.spotify.com` | Saved tracks, artist genres and the PKCE token exchange, only if Spotify is enabled.                                                                    |

## Assets

- Icon: `public/icon.svg` / generated sizes — neutral mark, no third-party
  logos or brand colors.
- Screenshots: `docs/screenshots/demo-*.png`, demo data only (1280 and 360,
  light and dark).
- Promotional tile: not prepared.

## Privacy practices answers

- Does the item collect user data? No data is transmitted to the developer.
- Data sent to third parties: artist/album/track title to Discogs and
  MusicBrainz; Spotify API when enabled. See `PRIVACY.md`.
- Remote code: none. Scripts are bundled.
- Data sale: no.
- Data use for creditworthiness/lending: no.

## Single purpose statement

"Build a genre cloud and genre statistics from the music library the user
saves in a supported streaming service."
