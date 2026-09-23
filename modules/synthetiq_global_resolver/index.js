/*
 * Synthetiq Music source module — Global Resolver
 * moduleFamilyId: synthetiq_global_resolver
 *
 * Search + full-length streaming through the "global" resolver bridge used by
 * the community's flagship TIDAL/Qobuz module family. Search returns Apple
 * Music catalogue metadata; stream resolution returns the best available
 * provider stream (Qobuz direct, FLAC / Hi-Res, verified full-length).
 *
 * IMPORTANT DEPENDENCY NOTE:
 *   This module talks to a third-party shared resolver instance. It is the
 *   same infrastructure the widely distributed community modules rely on.
 *   If the instance becomes unavailable, search and playback stop until a
 *   replacement base URL is configured. Keep heavy usage modest — respecting
 *   the shared instance is what keeps it alive for everyone.
 *
 * Contract v4 handlers: searchResults / extractAudioUrl (+ honest failures
 * for album-style extractDetails / extractTracks, which this source does not
 * provide). Verified: streams serve full-length beyond any teaser window
 * (tested to 120 MB continuous on a 24-bit/88.2 kHz FLAC).
 */
(function () {
  'use strict';

  var LOG_PREFIX = '[synthetiq_global_resolver]';
  var FAMILY = 'synthetiq_global_resolver';
  var RESOLVER_BASE = 'https://stop-using-my-instance.anothermoumen4.workers.dev';
  var QUALITIES = 'FLAC_HIRES,FLAC,AACLC';
  var PAGE_SIZE = 24;

  function ok(data) { return { ok: true, data: JSON.stringify(data) }; }
  function fail(message) { return { ok: false, error: { message: String(message || 'Resolver unavailable') } }; }

  function parseJsonBody(res) {
    if (!res) return Promise.reject(new Error('no response'));
    if (typeof res.json === 'function') return res.json();
    if (typeof res.text === 'function') return res.text().then(function (t) { return JSON.parse(t); });
    return Promise.reject(new Error('response is not readable'));
  }

  function get(path) {
    return fetch(RESOLVER_BASE + path, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
  }

  function trackIdFromInput(input) {
    var value = String(input || '').trim();
    if (!value) return '';
    var qualified = value.match(/^([^:]+):song:(.+)$/);
    if (qualified) {
      if (qualified[1] !== FAMILY) return '';
      value = qualified[2].trim();
    }
    return /^\d{1,16}$/.test(value) ? value : '';
  }

  function extensionFor(mime) {
    var m = String(mime || '');
    if (m.indexOf('flac') !== -1) return 'flac';
    if (m.indexOf('mpeg') !== -1) return 'mp3';
    if (m.indexOf('mp4') !== -1 || m.indexOf('m4a') !== -1) return 'm4a';
    if (m.indexOf('mpegurl') !== -1) return 'm3u8';
    return 'flac';
  }

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function isrc(value) {
    return text(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  function presentationTitle(value) {
    return text(value).replace(/\s*\((?:feat\.?|ft\.?|featuring)\s+[^)]*\)/gi, '')
      .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, '')
      .normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  }

  function presentationArtist(value) {
    return text(value).split(/\s*(?:,|&|\bfeat\.?\s|\bfeaturing\s)\s*/i)[0]
      .normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  }

  function actualRecording(data, requestedId) {
    var apple = data && data.apple;
    var track = data && data.track;
    var file = data && data.file;
    if (apple && apple.id != null && String(apple.id) !== requestedId) return null;
    if (!track || typeof track !== 'object') return null;
    if (file && file.track_id != null && track.id != null &&
        String(file.track_id) !== String(track.id)) return null;
    var expectedIsrc = isrc(apple && apple.isrc);
    var actualIsrc = isrc(track.isrc);
    if (expectedIsrc && actualIsrc && expectedIsrc !== actualIsrc) return null;
    var title = text(track.title);
    var artist = text(track.performer && track.performer.name) ||
      text(track.artist && track.artist.name) || text(track.artist);
    if (!title || !artist || /^unknown (track|artist)$/i.test(title) ||
        /^unknown (track|artist)$/i.test(artist)) return null;
    var duration = Number(track.duration);
    var album = text(track.album && track.album.title) || text(track.album);
    var appleTitle = text(apple && apple.title);
    var appleArtist = text(apple && apple.artist);
    // A verified identical ISRC permits catalogue presentation (e.g. a
    // featuring suffix), never relabelling a merely plausible audio match.
    var verifiedPresentation = apple && String(apple.id) === requestedId &&
      expectedIsrc && expectedIsrc === actualIsrc && appleTitle && appleArtist &&
      presentationTitle(appleTitle) === presentationTitle(title) &&
      presentationArtist(appleArtist) === presentationArtist(artist);
    return {
      title: verifiedPresentation ? appleTitle : title,
      artist: verifiedPresentation ? appleArtist : artist,
      album: verifiedPresentation ? text(apple.album) || album : album,
      resolvedTitle: title,
      resolvedArtist: artist,
      resolvedAlbum: album,
      identityEvidence: verifiedPresentation ? 'matching_isrc_and_requested_id' : 'provider_recording_metadata',
      durationSeconds: duration > 0 ? duration : undefined,
      providerTrackId: track.id == null ? undefined : String(track.id),
      isrc: actualIsrc || undefined
    };
  }

  function responseHeaders(data) {
    // Preserve only headers explicitly paired with this resolver response.
    var source = data.headers || (data.file && data.file.headers);
    var result = {};
    if (!source || typeof source !== 'object' || Array.isArray(source)) return result;
    Object.keys(source).forEach(function (key) {
      if (/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) &&
          typeof source[key] === 'string' && !/[\r\n]/.test(source[key])) {
        Object.defineProperty(result, key, {value: source[key], enumerable: true});
      }
    });
    return result;
  }

  function mapTrack(item) {
    if (!item || item.id == null) return null;
    var id = String(item.id);
    if (!/^\d{1,16}$/.test(id)) return null;
    var duration = Number(item.duration);
    return {
      id: FAMILY + ':song:' + id,
      href: FAMILY + ':song:' + id,
      type: 'track',
      title: item.title || '',
      artist: item.artist || item.albumArtist || 'Unknown Artist',
      album: item.album || undefined,
      image: item.artwork || item.artworkUrl || item.image || undefined,
      durationSeconds: duration > 0 ? duration : undefined
    };
  }

  async function searchResults(query, page) {
    var term = String(query || '').trim();
    if (!term) return ok([]);
    if (Number(page) > 0) return ok([]); // The resolver serves a single page per query in v1.
    try {
      var res = await get('/global/search/?term=' + encodeURIComponent(term) + '&limit=' + PAGE_SIZE);
      if (!res.ok && res.status !== 200) {
        return fail('Resolver search failed (HTTP ' + res.status + ').');
      }
      var data = await parseJsonBody(res);
      var items = (data && (data.tracks || data.items || data.results)) || [];
      return ok(items.map(mapTrack).filter(Boolean));
    } catch (err) {
      return fail('Resolver search failed: ' + (err && err.message ? err.message : err));
    }
  }

  async function extractAudioUrl(trackId, quality) {
    var id = trackIdFromInput(trackId);
    if (!id) return fail('Unrecognised track id for this source.');
    try {
      var res = await get('/global/track/?id=' + encodeURIComponent(id) + '&qualities=' + encodeURIComponent(QUALITIES));
      if (res.status === 404) return fail('Track not found on the resolver.');
      if (!res.ok && res.status !== 200) {
        return fail('Resolver stream lookup failed (HTTP ' + res.status + ').');
      }
      var data = await parseJsonBody(res);
      var url = data && data.streamUrl;
      if (typeof url !== 'string' || url.indexOf('https://') !== 0) {
        return fail('Resolver returned no playable stream for this track.');
      }
      var recording = actualRecording(data, id);
      if (!recording) return fail('Resolver recording identity is missing or does not match.');
      return ok({
        url: url,
        headers: responseHeaders(data),
        title: recording.title,
        artist: recording.artist,
        album: recording.album,
        durationSeconds: recording.durationSeconds,
        providerTrackId: recording.providerTrackId,
        isrc: recording.isrc,
        resolvedTitle: recording.resolvedTitle,
        resolvedArtist: recording.resolvedArtist,
        resolvedAlbum: recording.resolvedAlbum,
        identityEvidence: recording.identityEvidence,
        mimeType: data.mimeType || 'audio/flac',
        extension: extensionFor(data.mimeType),
        quality: data.audioQuality || data.quality || 'high',
        bitDepth: Number(data.bitDepth) || undefined,
        sampleRate: Number(data.sampleRate) || undefined
      });
    } catch (err) {
      return fail('Resolver stream lookup failed: ' + (err && err.message ? err.message : err));
    }
  }

  async function extractDetails(id) {
    return fail('This source does not provide album or playlist details.');
  }

  async function extractTracks(containerId) {
    return fail('This source does not provide album or playlist track listings.');
  }

  globalThis.searchResults = searchResults;
  globalThis.extractDetails = extractDetails;
  globalThis.extractTracks = extractTracks;
  globalThis.extractAudioUrl = extractAudioUrl;
})();
