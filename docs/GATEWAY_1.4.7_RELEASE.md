# Gateway 1.4.7 — bounded recording recovery

Intent: fix verified source catalogue misses without replacing the provider or
loosening recording identity. Published family stays `synthetiq_music_gateway`.
The reported unpadded catalogue ID decodes to `i need u` / Ken Carson.
Gateway 1.4.3 returned karaoke/type-beat/unrelated rows. The new source recovers
the correct provider-owned 149-second recording through title/artist catalogue
queries instead of accepting those rows.

## Changes

- Existing exact-artist catalogue and album IDs retained.
- First-page structured queries rank verified recordings before related artist
  catalogue rows; ordinary searches cannot be blanked by an artist-word suffix.
- Saved catalogue playback uses title-only recovery and at most three distinct
  artist-song pages, with strict title/artist/recording-version checks.
- Selected metadata is carried to detail resolution; changed duration/ISRC or
  provider ID is rejected. No arbitrary opaque-ID searches.
- Eight metadata fetches / 7.5-second lookup budget; shorter native fetch options
  and stale deadline rejection. Internal Home cannot enter unbudgeted recovery.
- Positive artist metadata cache only; transport failures stay retryable.
- HTTPS audio alternatives preferred; URLs and headers are never cached/synced.
- No new provider, SoundCloud adapter, loose credit/script normalization,
  server deployment, app install or store submission.

## Package and evidence

Flat ZIP: `packages/Synthetiq-Music-Gateway-1.4.7.zip` contains only index.js and
module.json. SHA-256:
`aee922442aa36328f9c7aec0192be29ff608de59ad9bfab1271a403be6d47f1e`.
Manifest retains existing download/Home/radio flags, contract and identities.
Existing 1.4.3 package and the three disabled sources are unchanged.

24 Node fixtures passed: artist pagination/albums, exact reported ID, wrong
artist/live/karaoke rejection, changed detail duration/ISRC, HTTPS route selection,
foreign IDs, outage retry, broad-search preservation and Home/error boundaries.
Final package passed five real macOS JavaScriptCore -> typed Dart port fixtures.
Combined targeted app test run: 30 passed, zero failures. Narrow policy analysis:
no issues. These are automated/runtime tests, not physical phone listening.

Two serial frozen-corpus runs of the release candidate returned 73/100, preserving
all 70 recorded baseline routes; MIA, Smells Like Teen Spirit and How You Like That
were recovered. The second run preceded the final Home/error-boundary hardening;
its source hash is retained separately in the app-side evidence. Do not conflate
that report with exact final package testing. A post-publication check must use
the downloaded final package, matching its hash and source bytes.

The reported exact saved ID resolved live in 2,032 ms; Ken Carson metadata was
correct, the head decoded, and later range bytes were served at HTTP 206.
One Dance, MIA and BbY WOW also had decoded heads + honored later ranges. Isolated
later MP4 fragments lack initialization metadata and need not decode standalone.
This does not prove complete audible tracks, recording fingerprints, background
playback or every user network. Full-track physical acceptance remains open.

## Offline compatibility

Existing distributed apps pin offline approval to exact package hashes. Keeping
the manifest flag true does NOT approve this new archive in old binaries. The
app's next release includes a separate exact family/version/hash approval;
no pendingKey bypass or global permission relaxation is used. Existing local
files are not removed. Streaming fixes can be delivered by a source update;
new offline downloads may remain unavailable until the matched app update.

## Installation / rollback

Sources -> Check for updates -> Gateway 1.4.7 -> Update; keep Gateway selected.
Alternatively add this repository's catalogue, not the legacy Synthetiq-Modules
catalogue. Test the saved Ken Carson track and a fresh search; listen through and
seek before reporting success. Do not delete the source/library to update it.

Rollback: restore only the Gateway catalogue entry to preserved 1.4.3 package,
hash `990cb4e7c5cb6ee90252a29c069a4b4165e6761e30e821b77d3bb8980eaa859f`.
This does not force already-updated devices to downgrade; offer the old ZIP for
explicit in-place reinstall. No source family or saved track ID migration.
