# Gateway 1.4.4: local recommendation experiment

Date: 2026-09-24. Status: **local candidate, not published or installed**.

## Intent and boundaries

Add optional ListenBrainz metadata to the existing JioSaavn suggestion path.
Keep the original seed, provider-owned recording metadata and existing audio
resolver. This is not YouTube Music's algorithm and not a new audio source.
The shared application still owns taste/history, queue priority, exclusions,
availability handling and ranking. No fixed 70/20/10 relevance claim is made.

Files changed: Gateway index.js and module.json (1.4.4), adapter regression
tests, opt-in metadata probe, this note, and the local 1.4.4 ZIP.
Search, artist/release browsing and audio handler code are unchanged. The
published catalogue and all earlier packages remain unchanged. Module family
and identity stay synthetiq_music_gateway / SP-MUS-3006-MUSIC-GATEWAY.

## Flow and limits

1. Return genuine native suggestions immediately (up to 40 over small pages).
2. Fetch the source-owned seed by its exact provider ID.
3. Find a unique MusicBrainz recording with matching title/primary artist and,
   when supplied, duration within five seconds. Reject ambiguous IDs and
   disambiguated versions, rather than guessing a DJ mix or different edit.
4. Request ListenBrainz similar recordings for that exact recording. Require
   the response to reference the same seed MBID.
5. Map each suggestion to this source's catalogue with the existing strict
   title/artist/version checks. Never replace a missing match with the first
   search result. Emit source metadata, not relabelled external search results.

Each operation performs at most one HTTP request with a two-second deadline.
The app permits four operations per refill and maintains the original seed.
MusicBrainz calls are rate-guarded to at least 1.1 seconds apart per runtime.
The cache holds at most four seeds for 30 minutes, 40 suggestions per provider
and 48 pages per seed. Cursor replay is idempotent and duplicate in-flight
requests coalesce. Optional failures preserve native suggestions, with a
30-second retry cooldown. No audio URLs, headers or credentials are cached.

This experiment shares seed title/artist/duration lookup context with
MusicBrainz, and the resulting recording ID with ListenBrainz. Those services
also receive the requesting device's IP. It does not upload accounts, history,
favourites or queues. Review this disclosure before any general release.

## App compatibility

The additional adapters activate only when the native host advertises
`__synthetiqBoundedFetchVersion = 1`. Older apps retain native-only suggestions.
The matching app runtime adds shorter fetch deadlines and aborts underlying
HTTP on deadline or runtime teardown. Updating only the source on build 26
does **not** activate the ListenBrainz path. No app assets bundle this module.

## Validation

- 32 source fixtures passed: 14 new adapter tests plus 18 existing artist and
  playback-identity tests. No live network requests in those tests.
- 33 focused native-runtime/installer tests passed in the app, including an
  offline test loading this actual index.js through the native JS bridge and
  typed Dart radio port: 40 native + one mapped suggestion, wrong artist
  rejected, five metadata operations, no audio request. Teardown and expired
  HTTP cancellation are covered.
- Shared application suite: 186 tests passed, including existing radio rules.
- Narrow Dart analysis: no issues. ZIP CRC and byte identity checks passed.

Live metadata-only sample results (no audio playback):

| Seed | Native unique tracks | Extra ListenBrainz tracks | Result |
| --- | ---: | ---: | --- |
| One Dance / Drake | 40 | 0 | Exact 174-second recording had no LB suggestions |
| Blinding Lights / The Weeknd | 40 | 0 | No accepted unique recording lookup |
| bad guy / Billie Eilish | 40 | 0 | No accepted unique recording lookup |
| Get Lucky / Daft Punk | — | — | Exact seed absent from first search results |
| Yellow / Coldplay | — | — | Exact seed absent from first search results |

Successful seed probes returned 17 bounded pages; maximum page times were
924/1101/1069 ms respectively in this run. These timings are observations,
not performance guarantees. The fixtures prove adapter mechanics, **not live
quality improvement**. No tested live seed gained an extra LB candidate.
Sparse or ambiguous recordings currently make coverage conservative. Candidate
matching without cross-provider ISRC/duration is not proof of audible identity.
Human relevance, complete audio and physical iPhone/Windows/Android acceptance
remain unverified; no release-ready claim is made.

## Reproduce

```sh
node --test test/gateway_radio_adapters.test.cjs test/gateway_artist_search.test.cjs test/gateway_identity.test.cjs
# Explicit operator-only network probe, not CI:
node test/probe_gateway_radio.cjs 'One Dance' Drake
```

The pre-existing gateway_identity.test.cjs belongs to the earlier audit and
is not added by this change. The adapter test is self-contained and committed.
Native cross-repo verification runs from packages/music_modules in the app:

```sh
MUSIC_GATEWAY_DIR=/absolute/path/to/modules/synthetiq_music_gateway flutter test --no-pub test/gateway_radio_integration_test.dart
```

## Artifact, release gate and rollback

`packages/Synthetiq-Music-Gateway-1.4.4.zip` contains root index.js/module.json.
SHA-256: `49f71bbc5f65923f83ceac80fbafa19b98ef790040b63e75e21163b4dc49087b`.
Do not promote as a recommendation-quality improvement until a wider live
sample demonstrates useful matched coverage and physical listening tests pass.
Publication and paired phone installation require separate approval.

Rollback is the retained 1.4.3 package (SHA-256
`990cb4e7c5cb6ee90252a29c069a4b4165e6761e30e821b77d3bb8980eaa859f`).
There is no database migration, new backend or persisted transport state.
The current phone and catalogues have not changed, so no device rollback is
needed for this local experiment.

References: [MusicBrainz recording search](https://musicbrainz.org/doc/Recording_Search),
[ListenBrainz Labs similar recordings](https://labs.api.listenbrainz.org/similar-recordings).
The authenticated ListenBrainz metadata lookup endpoint is deliberately not
used; no developer token or borrowed web key is introduced.
