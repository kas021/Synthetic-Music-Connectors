/*
 * Synthetiq Music source module — YT Music Direct
 * moduleFamilyId: synthetiq_ytmusic_direct
 *
 * Plays full-length audio from YouTube Music through the public InnerTube
 * endpoints. No account, no external bridge; every request goes straight to
 * music.youtube.com. Track identity is the 11-character video id.
 *
 * Ported and adapted from the community YTMusic-direct approach for the
 * Synthetiq Music v4 module contract (searchResults / extractDetails /
 * extractTracks / extractAudioUrl).
 *
 * Design rules honoured from the 8SPINE implementation:
 *  - WEB_REMIX search shelf parsing for songs
 *  - IOS player client first (adaptive audio/mp4), ANDROID fallback,
 *    HLS manifest as last resort
 *  - visitorData is best-effort: missing it must not break playback
 *  - no audio URL is stored anywhere except the return value of
 *    extractAudioUrl (the app pairs URL + headers in memory and resolves
 *    again after expiry failures)
 */
(function () {
  'use strict';

  var LOG_PREFIX = '[synthetiq_ytmusic_direct]';
  var YTM_BASE = 'https://music.youtube.com';
  var YTM_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
  var FAMILY = 'synthetiq_ytmusic_direct';

  var VISITOR_DATA_TTL_MS = 20 * 60 * 1000;
  var cachedVisitorData = null;
  var cachedVisitorDataAt = 0;

  var WEB_REMIX_CONTEXT = {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20260304.03.00',
    hl: 'en',
    gl: 'US'
  };
  var IOS_CONTEXT = {
    clientName: 'IOS',
    clientVersion: '20.22.1',
    deviceMake: 'Apple',
    deviceModel: 'iPhone16,2',
    osName: 'iPhone',
    osVersion: '18.5.0.22F76',
    hl: 'en',
    gl: 'US'
  };
  var ANDROID_CONTEXT = {
    clientName: 'ANDROID',
    clientVersion: '20.22.36',
    androidSdkVersion: 35,
    osName: 'Android',
    osVersion: '15',
    hl: 'en',
    gl: 'US'
  };
  var IOS_USER_AGENT = 'com.google.ios.youtube/20.22.1 (iPhone16,2; U; CPU iOS 18_5 like Mac OS X)';
  var ANDROID_USER_AGENT = 'com.google.android.youtube/20.22.36 (Linux; U; Android 15)';
  var WEB_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  var VIDEO_ID_RE = /^[-_A-Za-z0-9]{11}$/;

  function ok(data) { return { ok: true, data: JSON.stringify(data) }; }
  function fail(message) { return { ok: false, error: { message: String(message || 'Source unavailable') } }; }

  function parseDuration(text) {
    if (!text) return 0;
    var parts = String(text).split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }

  function bestThumbnail(thumbnails) {
    if (!thumbnails || !thumbnails.length) return '';
    var best = thumbnails[0];
    for (var i = 1; i < thumbnails.length; i++) {
      if ((thumbnails[i].width || 0) > (best.width || 0)) best = thumbnails[i];
    }
    // Prefer a reasonable size; s512/s544 look sharp without being huge.
    for (var j = thumbnails.length - 1; j >= 0; j--) {
      if ((thumbnails[j].width || 0) <= 600) return thumbnails[j].url;
    }
    return best.url;
  }

  function parseInfoRuns(runs) {
    if (!runs || !runs.length) return { artist: '', album: '', type: 'Song' };
    var parts = [];
    var current = '';
    for (var i = 0; i < runs.length; i++) {
      var text = runs[i].text;
      if (text === ' \u2022 ') {
        if (current) parts.push(current.trim());
        current = '';
      } else {
        current += text;
      }
    }
    if (current) parts.push(current.trim());

    var durationText = '';
    while (parts.length > 1 && /^\d+:\d{2}(:\d{2})?$/.test(parts[parts.length - 1])) {
      durationText = parts.pop();
    }

    var typeLabels = ['Song', 'Video', 'EP', 'Single', 'Podcast'];
    var idx = 0;
    var type = 'Song';
    if (parts.length > 1 && typeLabels.indexOf(parts[0]) !== -1) {
      type = parts[0];
      idx = 1;
    }
    return { artist: parts[idx] || '', album: parts[idx + 1] || '', type: type, durationText: durationText };
  }

  function getVideoId(renderer) {
    var direct =
      (renderer && renderer.playlistItemData && renderer.playlistItemData.videoId) ||
      (renderer && renderer.overlay && renderer.overlay.musicItemThumbnailOverlayRenderer &&
        renderer.overlay.musicItemThumbnailOverlayRenderer.content &&
        renderer.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer &&
        renderer.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint &&
        renderer.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint &&
        renderer.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint.videoId) || null;
    if (direct) return direct;

    var str = JSON.stringify(renderer || {});
    var watchMatch = str.match(/"watchEndpoint":\{"videoId":"([^"]+)"/);
    if (watchMatch) return watchMatch[1];
    var match = str.match(/"videoId":"([^"]+)"/);
    return match ? match[1] : '';
  }

  function getTitle(renderer) {
    var col = renderer && renderer.flexColumns && renderer.flexColumns[0] &&
      renderer.flexColumns[0].musicResponsiveListItemFlexColumnRenderer;
    var runs = col && col.text && col.text.runs;
    if (!runs) return '';
    return runs.map(function (t) { return t.text; }).join('');
  }

  function parseJsonBody(res) {
    if (!res) return Promise.reject(new Error('no response'));
    if (typeof res.json === 'function') return res.json();
    if (typeof res.text === 'function') {
      return res.text().then(function (t) { return JSON.parse(t); });
    }
    return Promise.reject(new Error('response is not readable'));
  }

  function post(url, body, headers) {
    return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
  }

  function callPlayer(trackId, client, userAgent) {
    var context = {};
    for (var k in client) context[k] = client[k];
    if (cachedVisitorData) context.visitorData = cachedVisitorData;
    return post(
      YTM_BASE + '/youtubei/v1/player?prettyPrint=false&key=' + YTM_API_KEY,
      { context: { client: context }, videoId: trackId, contentCheckOk: true, racyCheckOk: true },
      { 'Content-Type': 'application/json', 'User-Agent': userAgent }
    ).then(function (res) {
      if (!res.ok && res.status !== 200) {
        throw new Error(LOG_PREFIX + ' player HTTP ' + res.status);
      }
      return parseJsonBody(res);
    }).then(function (data) {
      var status = data && data.playabilityStatus && data.playabilityStatus.status;
      if (status && status !== 'OK') {
        cachedVisitorData = null;
        cachedVisitorDataAt = 0;
        throw new Error('Playback blocked: ' + ((data.playabilityStatus && data.playabilityStatus.reason) || status));
      }
      return data || {};
    });
  }

  function getVisitorData() {
    if (cachedVisitorData && (Date.now() - cachedVisitorDataAt) < VISITOR_DATA_TTL_MS) {
      return Promise.resolve(cachedVisitorData);
    }
    return post(
      YTM_BASE + '/youtubei/v1/visitor_id?key=' + YTM_API_KEY,
      { context: { client: WEB_REMIX_CONTEXT } },
      { 'Content-Type': 'application/json' }
    ).then(parseJsonBody).then(function (data) {
      if (data && data.responseContext && data.responseContext.visitorData) {
        cachedVisitorData = data.responseContext.visitorData;
      }
    }).catch(function () {
      // visitorData is best-effort; player calls generally work without it.
    }).then(function () {
      cachedVisitorDataAt = Date.now();
      return cachedVisitorData;
    });
  }

  function pickAudioFormat(streamingData, quality) {
    var adaptive = (streamingData.adaptiveFormats || []).filter(function (f) {
      return f && f.url && f.mimeType && f.mimeType.indexOf('audio/') === 0;
    });
    if (!adaptive.length) return null;
    var mp4 = adaptive.filter(function (f) { return f.mimeType.indexOf('audio/mp4') === 0; });
    var candidates = mp4.length ? mp4 : adaptive;
    candidates.sort(function (a, b) { return (a.bitrate || 0) - (b.bitrate || 0); });
    var isLow = String(quality || '').toLowerCase().indexOf('low') !== -1;
    return isLow ? candidates[0] : candidates[candidates.length - 1];
  }

  function extensionFor(mimeType) {
    var mime = String(mimeType || '');
    if (mime.indexOf('audio/mp4') === 0) return 'm4a';
    if (mime.indexOf('audio/mpeg') === 0) return 'mp3';
    if (mime.indexOf('audio/webm') === 0 || mime.indexOf('audio/opus') === 0) return 'webm';
    if (mime.indexOf('mpegurl') !== -1) return 'm3u8';
    return 'm4a';
  }

  function hlsResult(streamingData, quality) {
    if (streamingData && streamingData.hlsManifestUrl) {
      return {
        url: streamingData.hlsManifestUrl,
        headers: {},
        mimeType: 'application/vnd.apple.mpegurl',
        extension: 'm3u8',
        quality: quality || 'high'
      };
    }
    return null;
  }

  function audioDirectResult(picked, quality, extra) {
    if (!picked || !picked.url) return null;
    var result = {
      url: picked.url,
      headers: {},
      mimeType: picked.mimeType || 'audio/mp4',
      extension: extensionFor(picked.mimeType),
      quality: (String(quality || '').toLowerCase().indexOf('low') !== -1 ? 'low' : 'high'),
      bitrateKbps: Math.round((picked.bitrate || 0) / 1000)
    };
    if (extra) {
      result.title = extra.title || '';
      result.artist = extra.artist || '';
      result.album = extra.album || '';
      result.artwork = extra.artwork || '';
      result.durationSeconds = extra.durationSeconds || undefined;
    }
    return result;
  }

  // IOS first (direct audio/mp4, most reliable for music), ANDROID next,
  // HLS manifest only as a last resort.
  function resolvePlayback(trackId, quality, extra) {
    return callPlayer(trackId, IOS_CONTEXT, IOS_USER_AGENT).then(function (data) {
      var sd = data.streamingData || {};
      var picked = pickAudioFormat(sd, quality);
      var direct = audioDirectResult(picked, quality, extra);
      if (direct) return direct;
      var hls = hlsResult(sd, quality);
      if (hls) return hls;
      return callPlayer(trackId, ANDROID_CONTEXT, ANDROID_USER_AGENT).then(function (data2) {
        var sd2 = data2.streamingData || {};
        var picked2 = pickAudioFormat(sd2, quality);
        var direct2 = audioDirectResult(picked2, quality, extra);
        if (direct2) return direct2;
        var hls2 = hlsResult(sd2, quality);
        if (hls2) return hls2;
        throw new Error('No playable audio format was returned for this track.');
      });
    }).catch(function (err) {
      // Retry once through the Android client before failing.
      return callPlayer(trackId, ANDROID_CONTEXT, ANDROID_USER_AGENT).then(function (data3) {
        var sd3 = data3.streamingData || {};
        var picked3 = pickAudioFormat(sd3, quality);
        var direct3 = audioDirectResult(picked3, quality, extra);
        if (direct3) return direct3;
        var hls3 = hlsResult(sd3, quality);
        if (hls3) return hls3;
        throw err;
      });
    });
  }

  function trackIdFromInput(input) {
    var value = String(input || '').trim();
    if (!value) return '';
    var qualified = value.match(/^([^:]+):song:(.+)$/);
    if (qualified) {
      if (qualified[1] !== FAMILY && qualified[1] !== 'ytmusic') return '';
      value = qualified[2].trim();
    }
    return VIDEO_ID_RE.test(value) ? value : '';
  }

  function itemFromRenderer(renderer) {
    var videoId = getVideoId(renderer);
    if (!videoId) return null;
    var infoRuns = (renderer.flexColumns && renderer.flexColumns[1] &&
      renderer.flexColumns[1].musicResponsiveListItemFlexColumnRenderer &&
      renderer.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text &&
      renderer.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text.runs) || [];
    var info = parseInfoRuns(infoRuns);
    var durationText = (renderer.fixedColumns && renderer.fixedColumns[0] &&
      renderer.fixedColumns[0].musicResponsiveListItemFixedColumnRenderer &&
      renderer.fixedColumns[0].musicResponsiveListItemFixedColumnRenderer.text &&
      renderer.fixedColumns[0].musicResponsiveListItemFixedColumnRenderer.text.runs &&
      renderer.fixedColumns[0].musicResponsiveListItemFixedColumnRenderer.text.runs[0] &&
      renderer.fixedColumns[0].musicResponsiveListItemFixedColumnRenderer.text.runs[0].text) || '';
    var thumbs = (renderer.thumbnail && renderer.thumbnail.musicThumbnailRenderer &&
      renderer.thumbnail.musicThumbnailRenderer.thumbnail &&
      renderer.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails) || [];
    var durationSeconds = parseDuration(durationText || info.durationText);
    return {
      id: FAMILY + ':song:' + videoId,
      href: FAMILY + ':song:' + videoId,
      type: 'track',
      title: getTitle(renderer),
      artist: info.artist || 'Unknown Artist',
      album: info.album || undefined,
      image: bestThumbnail(thumbs) || undefined,
      durationSeconds: durationSeconds || undefined
    };
  }

  async function searchResults(query, page) {
    var term = String(query || '').trim();
    if (!term) return ok([]);
    if (Number(page) > 0) return ok([]); // InnerTube paging needs continuation tokens; v1 serves the first page.

    try {
      var res = await post(
        YTM_BASE + '/youtubei/v1/search?key=' + YTM_API_KEY,
        {
          context: { client: WEB_REMIX_CONTEXT },
          query: term,
          params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D'
        },
        {
          'Content-Type': 'application/json',
          'Origin': YTM_BASE,
          'Referer': YTM_BASE + '/',
          'User-Agent': WEB_USER_AGENT
        }
      );
      if (!res.ok && res.status !== 200) {
        return fail('YouTube Music search failed (HTTP ' + res.status + ').');
      }
      var data = await parseJsonBody(res);
      if (data && data.responseContext && data.responseContext.visitorData) {
        cachedVisitorData = data.responseContext.visitorData;
        cachedVisitorDataAt = Date.now();
      }
      var sections = (data && data.contents && data.contents.tabbedSearchResultsRenderer &&
        data.contents.tabbedSearchResultsRenderer.tabs && data.contents.tabbedSearchResultsRenderer.tabs[0] &&
        data.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer &&
        data.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content &&
        data.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer &&
        data.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents) || [];

      var items = [];
      for (var s = 0; s < sections.length; s++) {
        var shelf = sections[s] && sections[s].musicShelfRenderer;
        if (!shelf || !shelf.contents) continue;
        for (var c = 0; c < shelf.contents.length; c++) {
          if (items.length >= 24) break;
          var renderer = shelf.contents[c] && shelf.contents[c].musicResponsiveListItemRenderer;
          if (!renderer) continue;
          var item = itemFromRenderer(renderer);
          if (item) items.push(item);
        }
      }
      return ok(items);
    } catch (err) {
      return fail('YouTube Music search failed: ' + (err && err.message ? err.message : err));
    }
  }

  async function extractDetails(id) {
    var videoId = trackIdFromInput(id);
    if (!videoId) {
      return fail('This source provides songs only; album and playlist details are not supported yet.');
    }
    try {
      var data = await callPlayer(videoId, IOS_CONTEXT, IOS_USER_AGENT);
      var details = data.videoDetails || {};
      var thumbs = (details.thumbnail && details.thumbnail.thumbnails) || [];
      return ok({
        id: FAMILY + ':song:' + videoId,
        title: details.title || '',
        artist: details.author || '',
        image: bestThumbnail(thumbs) || undefined,
        durationSeconds: Number(details.lengthSeconds) || undefined,
        tracks: []
      });
    } catch (err) {
      return fail('Track details unavailable: ' + (err && err.message ? err.message : err));
    }
  }

  async function extractTracks(containerId) {
    return fail('This source provides songs only; album track listings are not supported yet.');
  }

  // Unsigned YouTube clients currently receive only a ~1 MiB teaser of every
  // stream (everything beyond answers 403; measured window edge at byte
  // 1048578). A single-byte probe two megabytes in tells a fully playable
  // stream from a teaser without downloading anything meaningful. When
  // YouTube lifts the restriction this check starts passing on its own.
  function fullPlaybackGate(url) {
    if (!url) return Promise.resolve(false);
    return fetch(url, { method: 'GET', headers: { 'Range': 'bytes=2097152-2097152' } })
      .then(function (res) { return !!(res && res.status === 206); })
      .catch(function () { return false; });
  }

  async function extractAudioUrl(trackId, quality) {
    var videoId = trackIdFromInput(trackId);
    if (!videoId) return fail('Unrecognised track id for this source.');
    try {
      var result = await resolvePlayback(videoId, quality || 'high', null);
      var playable = await fullPlaybackGate(result.url);
      if (!playable) {
        return fail('YouTube currently blocks full playback from unsigned sources (streams stop after about a minute). This source will start working again automatically when YouTube lifts the restriction.');
      }
      return ok(result);
    } catch (err) {
      return fail('YouTube Music could not resolve this track: ' + (err && err.message ? err.message : err));
    }
  }

  globalThis.searchResults = searchResults;
  globalThis.extractDetails = extractDetails;
  globalThis.extractTracks = extractTracks;
  globalThis.extractAudioUrl = extractAudioUrl;
})();
