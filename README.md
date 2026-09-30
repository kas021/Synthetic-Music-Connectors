# Synthetic Music Connectors

Versioned connector packages for Synthetiq Music.

This repository deliberately contains connector metadata and source packages
only. It does not contain an app, media files, account records, credentials,
resolved audio URLs, request headers, or downloaded audio.

## Install a connector

In Synthetiq Music, open **Settings → Sources → Advanced**, then paste:

`https://github.com/kas021/Synthetic-Music-Connectors`

The app downloads the package named by `catalogue.json`, verifies its SHA-256,
and installs it as a user-selected source.

The installable `modules` list currently contains only Synthetiq Music Gateway
1.4.3. Freefy Music, Global Resolver, and YT Music Direct remain in
`disabledModules` with their versioned packages intact for audit and rollback;
they are not offered by the normal in-app catalogue picker. This catalogue
change does not remotely disable copies users already installed, and someone
with a direct package URL can still access those public ZIPs.

## Current connector

`Synthetiq Music Gateway` is an isolated staging connector. It calls only the
Synthetiq Music Gateway and receives short-lived playback routes. It does not
contact upstream media hosts directly.

The connector remains staging-only until the gateway has passed authorised
catalogue, real-byte, seeking, and audible-playback tests on iPhone, Android,
and Windows. It must not be described as a public full-catalogue release
before those checks pass.

## Publishing policy

- Keep every released ZIP immutable and versioned.
- Add the package SHA-256 to `catalogue.json`.
- Retain prior package versions for rollback.
- Only add provider routes with a documented permitted integration contract.
- Never put source credentials, audio files, reusable media URLs, or headers
  in this repository.
Versioned connectors for Synthetiq Music.
