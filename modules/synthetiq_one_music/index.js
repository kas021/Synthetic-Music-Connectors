'use strict';

// Activation is owned by the host's reviewed native ONE binding, never by JS.
// No HTTP client, embedded credential, stream URL or audio extraction lives here.
// An old host must fail clearly rather than silently using another source.
function nativeTransportRequired() {
  throw new Error('one_native_transport_required');
}

globalThis.searchResults = nativeTransportRequired;
globalThis.extractDetails = nativeTransportRequired;
globalThis.extractTracks = nativeTransportRequired;
globalThis.extractAudioUrl = nativeTransportRequired;
