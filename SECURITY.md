# Security policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting
("Security" tab → "Report a vulnerability") or contact the maintainers through
the repository's security advisory channel.

Include:

- what the issue is and what an attacker could do;
- steps to reproduce, or a minimal proof of concept;
- extension version, browser and OS.

Do not include real tokens, cookies, account ids or library exports. Redact
them or replace them with dummy values.

## Scope

In scope:

- the extension code (`src/`, `public/`), packaging scripts and CI;
- token handling (Discogs token, Spotify tokens) and local storage;
- permission or host-permission abuse;
- injection or remote-code execution;
- unintended network requests to third parties.

Out of scope:

- the unofficial Yandex Music API itself breaking or changing;
- Discogs/MusicBrainz/Spotify outages or rate limiting;
- issues that require the user's own tokens to be already stolen;
- browser zero-days.

## Response

This is a volunteer project. Reports are acknowledged as soon as possible and
fixed in a patch release; there is no bug bounty.
