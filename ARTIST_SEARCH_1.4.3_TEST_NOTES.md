# Gateway 1.4.3 — local test candidate, not published

Baseline: published Gateway 1.4.2 at 61f1f60. Stable family and identity are
unchanged. The app repository's 1.4.1 source copy was not used as a baseline.

## Repairs

- Exact, unambiguous artist-name lookup selects a provider artist ID. Artist
  song and album endpoints use their actual zero-based page convention.
- Validate both artist ID and name in primary credits; retain collaborations.
  Ambiguous/non-artist searches retain ordinary one-based song pagination.
- Cache artist lookup metadata for 30 minutes, maximum 24 queries. Transport
  failures are not cached. Artist pages request songs and releases sequentially,
  with the existing bounded mirror loop; failed pages remain retryable and do
  not switch into unrelated song-title filler.
- Return source-owned release IDs/artwork/tracks. Generic provider `album`
  containers include singles, so unknown release classification stays unknown;
  the app labels these Releases rather than falsely claiming official albums.
- Album details reject an unexpected provider release ID.
- Existing audio matching/resolution and radio handlers are unchanged. The
  playback catalogue fallback uses its original song-search path, not the new
  artist lookup, to avoid changing playback request behaviour.

## Validation

- `node --check modules/synthetiq_music_gateway/index.js`: passed.
- `node --test test/gateway_artist_search.test.cjs test/gateway_identity.test.cjs`:
  18 passed. The identity test file predates this task and remains untracked;
  it is not swept into this commit. Six new artist-search regressions cover
  paging, unrelated credits, collaboration, ambiguity, transient failure,
  exhausted pages and exact album navigation.
- Live Mac metadata probe: pages 0/1/2 returned 10/10/10 tracks with 30 distinct
  provider IDs and no off-artist credit; release counts 10/10/8. Provider
  duplicates across editions remain possible and are grouped by the app.
- Opening Dark Lane Demo Tapes returned 14 tracks. These are catalogue/API
  checks, not playback or physical-device acceptance.
- Page 7 album endpoint returns an empty list while songs still return 10,
  confirming that exhausted releases do not prevent deeper song pagination.
- Provider metadata can still conflate identically named artists or include
  questionable releases. Exact provider credits do not certify official
  discography membership, catalogue completeness or audible identity.

## Candidate artifact

`packages/Synthetiq-Music-Gateway-1.4.3.zip`, root `index.js` and `module.json`.
SHA-256: `990cb4e7c5cb6ee90252a29c069a4b4165e6761e30e821b77d3bb8980eaa859f`.
ZIP integrity check passed. Published ZIPs and `catalogue.json` are untouched.

Publication to the test catalogue and phone installation require approval.
Do not promote this candidate to the official catalogue as part of that step.
Rollback: keep 1.4.2 available; no source family/library identity migration.
