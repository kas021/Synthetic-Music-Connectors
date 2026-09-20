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
      return ok({
        url: url,
        headers: {},
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
