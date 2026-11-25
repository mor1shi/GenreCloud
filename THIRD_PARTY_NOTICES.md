# Third-party notices

GenreCloud itself is MIT-licensed (see `LICENSE`). It bundles the following
software and uses the following services.

## Bundled software

| Component    | Version | License | Copyright / source                  |
| ------------ | ------- | ------- | ----------------------------------- |
| React        | 19.x    | MIT     | Meta Platforms, Inc. and affiliates |
| React DOM    | 19.x    | MIT     | Meta Platforms, Inc. and affiliates |
| Scheduler    | 0.28.x  | MIT     | Meta Platforms, Inc. and affiliates |
| lucide-react | 0.468.x | ISC     | Lucide contributors                 |
| Inter (font) | 4.x     | OFL-1.1 | The Inter Project Authors           |

The Inter font files are shipped in `public/fonts/` together with the
`OFL-Inter.txt` license text. Development-only dependencies (Vite, TypeScript,
Vitest, ESLint, Prettier) are not part of the built extension.

## Data sources and services

GenreCloud queries these services on your behalf. It does not redistribute
their databases.

### Discogs

Release styles and genres are read through the public Discogs API with your
own token (optional) or the unauthenticated rate limit. Discogs data is
subject to the [Discogs API terms](https://www.discogs.com/developers) and the
[Discogs privacy policy](https://www.discogs.com/privacy). Do not use
GenreCloud to build or redistribute a Discogs database.

### MusicBrainz

Genres and tags come from the MusicBrainz web service. Core MusicBrainz data
is published under CC0; genre and tag data contributed by the community is
made available under **CC BY-NC-SA**. GenreCloud is a non-commercial personal
project. If you republish an export that contains MusicBrainz-derived genres,
you must attribute MusicBrainz and respect the non-commercial/share-alike
terms.

### Spotify

Spotify is optional and marked experimental. Metadata is read through the
official Spotify Web API using your own Client ID (Authorization Code + PKCE).
Spotify content remains subject to the
[Spotify Developer Terms](https://developer.spotify.com/terms) and the
[Spotify Developer Policy](https://developer.spotify.com/policy). GenreCloud
does not store or redistribute Spotify audio or metadata beyond the local
library view, and track rows that come from Spotify link back to Spotify.

### Yandex Music

The Yandex Music integration uses the web player's internal API from the page
you already have open. Yandex Music data and terms belong to Yandex. The
integration is unofficial and may stop working at any time; see the disclaimer
in the README.
