(() => {
  'use strict';

  const YT_SEARCH_URL = 'https://music.youtube.com/youtubei/v1/search';
  const LISTENFREE_MIRRORS = [
    'https://backend.listenfree.in/api',
    'https://backend2.listenfree.in/api',
    'https://music-api.albatross0071.workers.dev/api'
  ];
  const REQUEST_TIMEOUT_MS = 10000;

  function ok(data) { return { ok: true, data: JSON.stringify(data) }; }
  function fail(message) { return { ok: false, error: { message: String(message || 'Source unavailable') } }; }

  async function postJson(url, body) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
    };
    if (typeof fetchv2 === 'function') {
      const res = await fetchv2(url, headers, 'POST', JSON.stringify(body));
      return typeof res === 'string' ? JSON.parse(res) : res;
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined
      });
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function getJson(url) {
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
    };
    if (typeof fetchv2 === 'function') {
      const res = await fetchv2(url, headers, 'GET', null);
      return typeof res === 'string' ? JSON.parse(res) : res;
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const res = await fetch(url, { method: 'GET', headers, signal: controller ? controller.signal : undefined });
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function searchResults(query, page) {
    const term = String(query || '').trim();
    if (!term) return ok([]);

    try {
      const payload = {
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
        query: term,
        params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA==' // songs only
      };
      const data = await postJson(YT_SEARCH_URL, payload);
      const tracks = [];
      const sectionList = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

      for (const section of sectionList) {
        const shelf = section.musicShelfRenderer || section.musicCardShelfRenderer;
        if (!shelf || !shelf.contents) continue;

        for (const item of shelf.contents) {
          const flex = item.musicResponsiveListItemRenderer;
          if (!flex) continue;

          let videoId = flex.playlistItemData?.videoId || flex.doubleTapCommand?.watchEndpoint?.videoId;
          if (!videoId) {
            videoId = flex.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
          }
          if (!videoId) continue;

          const titleRuns = flex.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
          const title = titleRuns?.[0]?.text || 'Track';

          const subtitleRuns = flex.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          let artist = 'Unknown Artist';
          let album;
          let durationSeconds;

          if (subtitleRuns.length > 0) {
            artist = subtitleRuns[0]?.text?.trim() || 'Unknown Artist';
            if (subtitleRuns.length >= 3 && subtitleRuns[1]?.text?.trim() === '•') {
              album = subtitleRuns[2]?.text?.trim();
            }
            for (let i = subtitleRuns.length - 1; i >= 0; i--) {
              const match = String(subtitleRuns[i]?.text || '').trim().match(/^(\d+):(\d+)$/);
              if (match) {
                durationSeconds = (parseInt(match[1], 10) * 60) + parseInt(match[2], 10);
                break;
              }
            }
          }

          let imageUrl;
          const thumbs = flex.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
          if (thumbs && thumbs.length) {
            imageUrl = thumbs[thumbs.length - 1].url?.replace(/=w\d+-h\d+.*$/, '=w544-h544-l90-rj');
          }

          tracks.push({
            id: 'freefy:yt:' + videoId,
            href: 'freefy:yt:' + videoId,
            type: 'track',
            title,
            artist,
            album,
            image: imageUrl,
            durationSeconds
          });
        }
      }

      if (tracks.length > 0) return ok(tracks);
    } catch (_) {}

    // Fallback to ListenFree mirrors
    for (const mirror of LISTENFREE_MIRRORS) {
      try {
        const url = mirror + '/search/songs?query=' + encodeURIComponent(term) + '&page=' + (Math.max(0, Number(page) || 0) + 1) + '&limit=20';
        const res = await getJson(url);
        const results = res?.data?.results || [];
        if (results.length > 0) {
          const tracks = results.map(r => ({
            id: 'freefy:saavn:' + (r.id || ''),
            href: 'freefy:saavn:' + (r.id || ''),
            type: 'track',
            title: String(r.name || r.title || 'Track'),
            artist: String(r.primaryArtists || r.artists?.primary?.[0]?.name || 'Unknown Artist'),
            album: r.album?.name || undefined,
            image: Array.isArray(r.image) ? r.image[r.image.length - 1]?.url : r.image,
            durationSeconds: Number(r.duration) || undefined
          }));
          return ok(tracks);
        }
      } catch (_) {}
    }

    return ok([]);
  }

  async function extractAudioUrl(trackId, quality) {
    const ref = String(trackId || '').trim().match(/^freefy:(yt|saavn):([A-Za-z0-9_-]+)$/);
    if (!ref) return fail('This legacy track has an ambiguous provider identity. Search again to refresh it.');
    if (ref[1] === 'yt') return fail('YouTube metadata is available, but this source has no verified YouTube playback route.');
    const cleanId = ref[2];

    // 1. Try ListenFree mirrors for direct 320kbps MP4 Akamai CDN stream
    for (const mirror of LISTENFREE_MIRRORS) {
      try {
        const res = await getJson(mirror + '/songs/' + cleanId);
        const rows = Array.isArray(res?.data) ? res.data : [res?.data];
        const songData = rows.find(row => row && String(row.id || '') === cleanId);
        if (songData && Array.isArray(songData.downloadUrl)) {
          let stream320 = null;
          let fallback = null;
          for (const d of songData.downloadUrl) {
            if (d?.url && /^https:\/\//i.test(String(d.url))) {
              if (String(d.quality).includes('320')) stream320 = d.url;
              fallback = d.url;
            }
          }
          const best = stream320 || fallback;
          if (best) {
            return ok({
              url: best,
              headers: {},
              mimeType: 'audio/mp4',
              extension: 'mp4',
              title: songData.name || 'Track',
              artist: songData.primaryArtists || (songData.artists?.primary || []).map(a => a.name).filter(Boolean).join(', ') || 'Unknown Artist',
              album: songData.album?.name || '',
              artwork: Array.isArray(songData.image) ? songData.image[songData.image.length - 1]?.url : songData.image || '',
              durationSeconds: Number(songData.duration) || undefined,
              quality: quality || 'high'
            });
          }
        }
      } catch (_) {}
    }

    // Provider IDs are not search queries. Never substitute the first result.
    return fail('No full-length audio stream is available for this track.');
  }

  function toAlbum(item) {
    const id = item?.providerItemId || item?.id || item?.albumId;
    const title = item?.name || item?.title;
    if (!id || !title) return null;
    let image = item.image || item.imageUrl;
    if (Array.isArray(image)) image = image[image.length - 1]?.url;
    const artist = Array.isArray(item.artists?.primary)
      ? item.artists.primary.map(credit => credit.name).filter(Boolean).join(', ')
      : String(item.primaryArtists || item.primary_artists || item.artist || '');
    const releaseType = String(item.releaseType || item.record_type || '').toLowerCase();
    return {
      type: 'album',
      id: 'album:' + String(id),
      title: String(title),
      artist,
      image,
      year: item.year ? String(item.year) : undefined,
      trackCount: Number(item.songCount || item.song_count) || undefined,
      releaseType: ['album', 'single', 'ep'].includes(releaseType) ? releaseType : 'unknown'
    };
  }

  // Freefy's supported album catalogue is ListenFree/JioSaavn only. YouTube
  // Music search remains song-only and is never treated as album evidence.
  async function searchAlbums(query, page) {
    const term = String(query || '').trim();
    if (!term) return ok([]);
    const pageIndex = Math.max(0, Math.min(59, Math.floor(Number(page) || 0)));
    let gotResponse = false;
    for (const mirror of LISTENFREE_MIRRORS) {
      try {
        const url = mirror + '/search/albums?query=' + encodeURIComponent(term) +
          '&page=' + (pageIndex + 1) + '&limit=20';
        const response = await getJson(url);
        const results = response?.data?.results || response?.results;
        if (Array.isArray(results)) {
          gotResponse = true;
          const albums = results.slice(0, 20).map(toAlbum).filter(Boolean);
          if (albums.length) return ok(albums);
        }
      } catch (_) {}
    }
    return gotResponse
      ? ok([])
      : fail('Album search is temporarily unavailable. Retry this page.');
  }

  async function extractDetails(id) {
    const cleanId = String(id || '').replace(/^(album|playlist|freefy):/, '').trim();
    for (const mirror of LISTENFREE_MIRRORS) {
      try {
        const res = await getJson(mirror + '/albums?id=' + encodeURIComponent(cleanId));
        const data = res?.data;
        if (data && String(data.id || '') === cleanId) {
          const release = toAlbum(data);
          const tracks = (data.songs || []).map(s => ({
            id: 'freefy:saavn:' + s.id,
            href: 'freefy:saavn:' + s.id,
            type: 'track',
            title: String(s.name || 'Track'),
            artist: String(s.primaryArtists || 'Unknown Artist'),
            album: data.name,
            image: Array.isArray(s.image) ? s.image[s.image.length - 1]?.url : s.image,
            durationSeconds: Number(s.duration) || undefined
          }));
          return ok({
            id: 'album:' + cleanId,
            title: String(data.name || 'Album'),
            artist: release?.artist || '',
            image: Array.isArray(data.image) ? data.image[data.image.length - 1]?.url : data.image,
            year: data.year ? String(data.year) : undefined,
            trackCount: Number(data.songCount || data.song_count) || undefined,
            releaseType: release?.releaseType || 'unknown',
            tracks
          });
        }
      } catch (_) {}
    }
    return fail('Album details unavailable.');
  }

  async function extractTracks(containerId) {
    const details = await extractDetails(containerId);
    if (!details.ok) return details;
    const parsed = JSON.parse(details.data);
    return ok(parsed.tracks || []);
  }

  async function homeSections(page) {
    if (Number(page) > 0) return ok([]);
    const sections = [];
    for (const row of [
      { title: 'Trending Global Hits', query: 'top hits 2026' },
      { title: 'Popular Hip-Hop & Rap', query: 'drake hip hop' },
      { title: 'New Releases', query: 'new release songs' }
    ]) {
      const res = await searchResults(row.query, 0);
      if (res.ok) {
        const items = JSON.parse(res.data);
        if (items.length) sections.push({ title: row.title, type: 'track', items: items.slice(0, 12) });
      }
    }
    return sections.length ? ok(sections) : fail('Home sections unavailable.');
  }

  async function getRelatedTracks(seedId) {
    return ok([]); // No verified seed relationship is supplied by this source.
  }

  globalThis.searchResults = searchResults;
  globalThis.searchAlbums = searchAlbums;
  globalThis.homeSections = homeSections;
  globalThis.extractDetails = extractDetails;
  globalThis.extractTracks = extractTracks;
  globalThis.extractAudioUrl = extractAudioUrl;
  globalThis.getRelatedTracks = getRelatedTracks;
})();
