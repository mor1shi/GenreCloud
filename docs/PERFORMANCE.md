# Lookup performance

## Baseline (v1.0 behaviour)

The original implementation queried the catalogs **per track**:

- Discogs first, one search per track, spaced 2.7 s apart (25 requests/min);
- MusicBrainz second, only when Discogs returned nothing, 1.5 s apart.

On a ~700-track library that is 700 sequential requests plus fallbacks, which
matches the observed 30–35 minutes.

## Measured improvement

`bench/benchmark.test.ts` builds a deterministic library of 686 liked tracks
(189 albums, 20 artists with albumless singles, 10 % of albums missing in
Discogs) and runs both pipelines against a virtual clock. The clock advances
only when a request or rate-limit wait asks for time, so the simulated
35-minute run completes in under a second without changing the rate-limit
math.

| Metric | Per-track baseline | Grouped (current) | Change |
| --- | ---: | ---: | ---: |
| Simulated duration | 1 945 200 ms (32.4 min) | 520 050 ms (8.7 min) | **3.74× faster** |
| Discogs requests | 686 | 209 | −70 % |
| MusicBrainz requests | 62 | 223 | +261 % |
| Total requests | 748 | 432 | −42 % |

Why MusicBrainz requests grow: both queues now run **in parallel** and
MusicBrainz is asked for every group, not only after an empty Discogs answer.
This is deliberate — its 1 req/s budget is the cheap resource, and waiting for
Discogs to fail would serialize the queues again. Its queue finishes long
before Discogs.

Request reduction comes from grouping: one Discogs search per artist+album
(189 groups) and per albumless artist (20), instead of one per track (686).
Discogs remains the bottleneck: 209 × 2.4 s ≈ 8.4 min. With a personal token
(60 req/min) the same run takes roughly 4 minutes.

## Reproduce

```bash
npm run bench
```

The test asserts a speedup of at least 3× and at least a 3× drop in Discogs
requests. Results are printed as a single `BENCHMARK {json}` line.

## Caveats

- The benchmark models catalog latency as a constant 150 ms (Discogs) and
  80 ms (MusicBrainz); real latency varies by network and region.
- It does not model HTTP 429/503 retries. Those are covered by unit tests for
  the rate limiter and `fetchJson`.
- The virtual clock measures wall-clock waits, not CPU time. The in-browser
  run has the same waits, so the ratio should hold, but absolute minutes depend
  on the user's connection.
- Results are cached in `storage.local`; a second run over a fully refined
  library performs no catalog requests at all.
