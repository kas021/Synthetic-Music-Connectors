(() => {
  'use strict';

  const MIRRORS = [
    'https://backend.listenfree.in/api',
    'https://backend2.listenfree.in/api',
    'https://music-api.albatross0071.workers.dev/api',
    'https://music-api2.albatross0071.workers.dev/api'
  ];

  // Keep an opaque catalogue id and each provider response bounded. A source
  // response is untrusted input; it must not turn one playback request into an
  // unbounded walk through search results or provider ids.
  const MAX_BASE64_INPUT_LENGTH = 8192;
  const MAX_CATALOGUE_ID_LENGTH = 4096;
  const MAX_DIRECT_ITEMS = 16;
  const MAX_FALLBACK_SEARCH_RESULTS = 24;
  const MAX_FALLBACK_CANDIDATES = 5;
  const RECORDING_VARIANTS = new Set([
    'instrumental',
    'karaoke',
    'cover',
    'tribute',
    'remix',
    'remixed',
    'live',
    'acoustic',
    'edit',
    'edited',
    'demo',
    'sped',
    'slowed',
    'remaster',
    'remastered',
    'mono',
    'nightcore'
  ]);
  const ALLOWED_TITLE_SUFFIXES = new Set([
    'explicit',
    'explicit version',
    'official audio',
    'official video'
  ]);

  const _cipherKey = '38346591';
  const _ip = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
  const _fp = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
  const _e = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
  const _p = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
  const _pc1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
  const _pc2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
  const _shifts = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
  const _sBox = [
    [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
    [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
    [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
    [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
    [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
    [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
    [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
    [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]
  ];

  function base64ToBytes(b64) {
    const input = String(b64 || '').trim();
    if (!input || input.length > MAX_BASE64_INPUT_LENGTH) return null;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input)) return null;
    const padding = (input.match(/=+$/) || [''])[0].length;
    const unpaddedLength = input.length - padding;
    if (unpaddedLength % 4 === 1) return null;
    if (padding && input.length % 4 !== 0) return null;

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const str = input.replace(/=+$/, '');
    const bytes = [];
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < str.length; i++) {
      const value = chars.indexOf(str[i]);
      if (value < 0) return null;
      buffer = (buffer << 6) | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
      }
    }
    return bytes;
  }

  function utf8Decode(bytes) {
    if (!Array.isArray(bytes)) return '';
    let output = '';
    for (let i = 0; i < bytes.length;) {
      const first = bytes[i++];
      let codePoint;
      let needed;
      if (first <= 0x7f) {
        codePoint = first;
        needed = 0;
      } else if (first >= 0xc2 && first <= 0xdf) {
        codePoint = first & 0x1f;
        needed = 1;
      } else if (first >= 0xe0 && first <= 0xef) {
        codePoint = first & 0x0f;
        needed = 2;
      } else if (first >= 0xf0 && first <= 0xf4) {
        codePoint = first & 0x07;
        needed = 3;
      } else {
        return '';
      }

      if (i + needed > bytes.length) return '';
      for (let j = 0; j < needed; j++) {
        const next = bytes[i++];
        if ((next & 0xc0) !== 0x80) return '';
        codePoint = (codePoint << 6) | (next & 0x3f);
      }
      if ((needed === 1 && codePoint < 0x80) ||
          (needed === 2 && codePoint < 0x800) ||
          (needed === 3 && codePoint < 0x10000) ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
          codePoint > 0x10ffff) {
        return '';
      }
      if (codePoint <= 0xffff) {
        output += String.fromCharCode(codePoint);
      } else {
        const adjusted = codePoint - 0x10000;
        output += String.fromCharCode(
          0xd800 + (adjusted >> 10),
          0xdc00 + (adjusted & 0x3ff)
        );
      }
    }
    return output;
  }

  function bytesToBits(bytes) {
    let bits = [];
    for (let b of bytes) {
      for (let j = 7; j >= 0; j--) bits.push((b >> j) & 1);
    }
    return bits;
  }

  function bitsToBytes(bits) {
    let bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      bytes.push(b);
    }
    return bytes;
  }

  function permute(bits, table) {
    return table.map(idx => bits[idx - 1]);
  }

  function generateSubkeys(keyBytes) {
    let keyBits = bytesToBits(keyBytes);
    let permutedKey = permute(keyBits, _pc1);
    let c = permutedKey.slice(0, 28);
    let d = permutedKey.slice(28, 56);
    let subkeys = [];
    for (let i = 0; i < 16; i++) {
      let shift = _shifts[i];
      c = c.slice(shift).concat(c.slice(0, shift));
      d = d.slice(shift).concat(d.slice(0, shift));
      subkeys.push(permute(c.concat(d), _pc2));
    }
    return subkeys;
  }

  function feistel(r, subkey) {
    let er = permute(r, _e);
    let xored = er.map((bit, idx) => bit ^ subkey[idx]);
    let sboxOut = [];
    for (let i = 0; i < 8; i++) {
      let block = xored.slice(i * 6, (i + 1) * 6);
      let row = (block[0] << 1) | block[5];
      let col = (block[1] << 3) | (block[2] << 2) | (block[3] << 1) | block[4];
      let val = _sBox[i][row * 16 + col];
      for (let j = 3; j >= 0; j--) sboxOut.push((val >> j) & 1);
    }
    return permute(sboxOut, _p);
  }

  function decryptBlock(blockBytes, subkeys) {
    let bits = permute(bytesToBits(blockBytes), _ip);
    let l = bits.slice(0, 32);
    let r = bits.slice(32, 64);
    for (let i = 15; i >= 0; i--) {
      let f = feistel(r, subkeys[i]);
      let nextR = l.map((bit, idx) => bit ^ f[idx]);
      l = r;
      r = nextR;
    }
    return bitsToBytes(permute(r.concat(l), _fp));
  }

  function decryptMediaUrl(b64) {
    try {
      let rawBytes = base64ToBytes(b64);
      let keyBytes = [];
      for (let i = 0; i < _cipherKey.length; i++) keyBytes.push(_cipherKey.charCodeAt(i));
      let subkeys = generateSubkeys(keyBytes);
      let decryptedBytes = [];
      for (let i = 0; i < rawBytes.length; i += 8) {
        let block = rawBytes.slice(i, i + 8);
        decryptedBytes = decryptedBytes.concat(decryptBlock(block, subkeys));
      }
      let pad = decryptedBytes[decryptedBytes.length - 1];
      if (pad > 0 && pad <= 8) decryptedBytes.splice(decryptedBytes.length - pad, pad);
      let result = '';
      for (let i = 0; i < decryptedBytes.length; i++) result += String.fromCharCode(decryptedBytes[i]);
      return result;
    } catch (_) {
      return '';
    }
  }

  function decodeBase64(input) {
    return utf8Decode(base64ToBytes(input));
  }

  function parseTrackQuery(trackId) {
    let clean = String(trackId || '').replace(/^catalogue:/, '').trim();
    if (!clean || clean.length > MAX_CATALOGUE_ID_LENGTH) return null;
    let decoded = decodeBase64(clean);
    if (!decoded || decoded.indexOf('\x00') === -1) return null;
    let parts = decoded.split('\x00');
    const title = String(parts[0] || '').trim();
    const artist = String(parts[1] || '').trim();
    if (!title || !artist) return null;
    return { title, artist, query: title + ' ' + artist };
  }

  function ok(data) { return { ok: true, data: JSON.stringify(data) }; }
  function fail(message) { return { ok: false, error: { message: String(message || 'Music gateway unavailable') } }; }

  async function httpGet(url) {
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
    };
    try {
      const res = await fetch(url, { method: 'GET', headers });
      if (res.status === 200) {
        return await res.json();
      }
    } catch (_) {}
    return null;
  }

  async function mirrorGet(path, accepts) {
    for (const mirror of MIRRORS) {
      const data = await httpGet(mirror + path);
      if (data && (data.data || data.results || data.success || data.status === 'SUCCESS')) {
        if (!accepts || accepts(data)) return data;
      }
    }
    return null;
  }

  async function directJioSaavn(params) {
    const query = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    const url = 'https://www.jiosaavn.com/api.php?_format=json&_marker=0&ctx=web6dot0&' + query;
    return await httpGet(url);
  }

  function toTrack(item) {
    if (!item) return null;
    const id = item.providerItemId || item.id || item.songId;
    if (!id) return null;
    const title = String(item.title || item.name || 'Track');
    let artist = 'Unknown Artist';
    if (item.artist) artist = String(item.artist);
    else if (item.primaryArtists) artist = String(item.primaryArtists);
    else if (item.primary_artists) artist = String(item.primary_artists);
    else if (item.artists && Array.isArray(item.artists.primary) && item.artists.primary.length) {
      artist = item.artists.primary.map(a => a.name).join(', ');
    }

    let image = item.image || item.imageUrl;
    if (Array.isArray(image) && image.length) {
      image = image[image.length - 1]?.url || image[image.length - 1];
    }

    let album = item.album?.name || (typeof item.album === 'string' ? item.album : undefined);
    let durationSeconds = Number(item.durationSeconds || item.duration) || undefined;

    return {
      id: 'synthetiq_music_gateway:song:' + id,
      href: 'synthetiq_music_gateway:song:' + id,
      type: 'track',
      title,
      artist,
      album,
      albumId: item.album?.id ? 'album:' + item.album.id : undefined,
      image,
      durationSeconds
    };
  }

  function trackMetadata(item) {
    if (!item || typeof item !== 'object') {
      return { title: '', artist: '', album: '' };
    }
    const title = item.title ?? item.name;
    let artist = item.artist ?? item.primaryArtists ?? item.primary_artists;
    if ((artist === undefined || artist === null || String(artist).trim() === '') &&
        item.artists && Array.isArray(item.artists.primary)) {
      const names = item.artists.primary
        .map(a => a && a.name)
        .filter(name => name !== undefined && name !== null && String(name).trim() !== '')
        .map(name => String(name).trim());
      if (names.length) artist = names.join(', ');
    }
    const album = item.album && typeof item.album === 'object'
      ? item.album.name
      : item.album;
    return {
      title: title === undefined || title === null ? '' : String(title).trim(),
      artist: artist === undefined || artist === null ? '' : String(artist).trim(),
      album: album === undefined || album === null ? '' : String(album).trim()
    };
  }

  function canonicalIdentityText(value) {
    let text = String(value === undefined || value === null ? '' : value).trim();
    try {
      text = text.normalize('NFKC');
    } catch (_) {}
    return text.toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function primaryArtist(value) {
    const text = String(value === undefined || value === null ? '' : value).trim();
    const match = text.match(/^(.*?)(?:,|&|\s+feat\.?|\s+ft\.?|\s+with\s+)/i);
    return (match ? match[1] : text).trim();
  }

  function usableTrackMetadata(item) {
    const metadata = trackMetadata(item);
    const title = canonicalIdentityText(metadata.title);
    const artist = canonicalIdentityText(primaryArtist(metadata.artist));
    // The display mapper has safe placeholders, but placeholders are not
    // evidence that a provider returned the requested recording.
    return !!title && title !== 'track' && title !== 'unknown track' &&
      !!artist && artist !== 'unknown artist';
  }

  function recordingVariants(item) {
    const metadata = trackMetadata(item);
    const words = canonicalIdentityText(metadata.title + ' ' + metadata.album)
      .split(' ')
      .filter(Boolean);
    const variants = new Set();
    for (const word of words) {
      if (!RECORDING_VARIANTS.has(word)) continue;
      if (word === 'remixed') variants.add('remix');
      else if (word === 'edited') variants.add('edit');
      else if (word === 'remastered') variants.add('remaster');
      else variants.add(word);
    }
    return variants;
  }

  function sameVariantSet(left, right) {
    if (left.size !== right.size) return false;
    for (const value of left) {
      if (!right.has(value)) return false;
    }
    return true;
  }

  function strongTitleMatch(wanted, candidate) {
    if (wanted === candidate) return true;
    const shorter = wanted.length < candidate.length ? wanted : candidate;
    const longer = wanted.length < candidate.length ? candidate : wanted;
    if (!longer.startsWith(shorter + ' ')) return false;
    const suffix = longer.substring(shorter.length).trim();
    // A shared prefix is not enough to identify a recording. Only harmless
    // provider presentation labels may extend an otherwise exact title.
    return ALLOWED_TITLE_SUFFIXES.has(suffix);
  }

  function matchesTrackIdentity(wanted, candidate) {
    if (!usableTrackMetadata(wanted) || !usableTrackMetadata(candidate)) return false;
    const wantedMetadata = trackMetadata(wanted);
    const candidateMetadata = trackMetadata(candidate);
    const wantedTitle = canonicalIdentityText(wantedMetadata.title);
    const candidateTitle = canonicalIdentityText(candidateMetadata.title);
    const wantedArtist = canonicalIdentityText(primaryArtist(wantedMetadata.artist));
    const candidateArtist = canonicalIdentityText(primaryArtist(candidateMetadata.artist));
    return strongTitleMatch(wantedTitle, candidateTitle) &&
      wantedArtist === candidateArtist &&
      sameVariantSet(recordingVariants(wanted), recordingVariants(candidate));
  }

  function hasProviderIdentity(item, expectedId) {
    if (!item || typeof item !== 'object') return false;
    const ids = [item.providerItemId, item.id, item.songId]
      .filter(value => value !== undefined && value !== null)
      .map(value => String(value).trim())
      .filter(Boolean);
    return ids.length > 0 && ids.every(id => id === expectedId);
  }

  function providerIdFromTrackId(trackId) {
    const value = String(trackId === undefined || trackId === null ? '' : trackId).trim();
    if (!value || value.length > 256) return '';

    const qualified = value.match(/^([^:]+):song:(.+)$/);
    if (qualified) {
      // A fallback candidate must belong to this module. The saavn prefix is
      // retained only for old local IDs produced by this same source family.
      if (qualified[1] !== 'synthetiq_music_gateway' && qualified[1] !== 'saavn') return '';
      return qualified[2].trim();
    }

    const legacy = value.match(/^(?:synthetiq_music_gateway|saavn|song|track):(.+)$/);
    if (legacy) return legacy[1].trim();
    return value.indexOf(':') === -1 ? value : '';
  }

  function findMirrorSong(response, expectedId) {
    const data = response?.data;
    const rows = Array.isArray(data) ? data : [data];
    let inspected = 0;
    for (const row of rows) {
      if (inspected++ >= MAX_DIRECT_ITEMS) break;
      if (hasProviderIdentity(row, expectedId)) return row;
    }
    return null;
  }

  function findJioSong(response, expectedId) {
    if (!response || typeof response !== 'object') return null;
    const keyed = response[expectedId];
    if (keyed && hasProviderIdentity(keyed, expectedId)) return keyed;
    if (Array.isArray(response.songs)) {
      let inspected = 0;
      for (const row of response.songs) {
        if (inspected++ >= MAX_DIRECT_ITEMS) break;
        if (hasProviderIdentity(row, expectedId)) return row;
      }
    }
    return hasProviderIdentity(response, expectedId) ? response : null;
  }

  function pickDownloadUrl(songData) {
    if (!songData || !Array.isArray(songData.downloadUrl)) return null;
    let stream320 = null;
    let streamFallback = null;
    for (const entry of songData.downloadUrl) {
      const url = entry && entry.url ? String(entry.url).trim() : '';
      if (!url) continue;
      if (String(entry.quality || '').indexOf('320') !== -1) stream320 = url;
      streamFallback = url;
    }
    return stream320 || streamFallback;
  }

  function audioResultFromMirror(songData, quality, wanted) {
    if (!songData || !usableTrackMetadata(songData) ||
        (wanted && !matchesTrackIdentity(wanted, songData))) return null;
    const url = pickDownloadUrl(songData);
    const track = toTrack(songData);
    if (!url || !track) return null;
    return ok({
      url,
      headers: {},
      mimeType: 'audio/mp4',
      extension: 'mp4',
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      artwork: track.image || '',
      durationSeconds: track.durationSeconds,
      quality: quality || 'high'
    });
  }

  async function resolveProviderTrack(providerId, quality, wanted) {
    if (!providerId || providerId.length < 4 || providerId.indexOf(':') !== -1) return null;

    // A mirror is accepted only when its provider id, metadata, and playable
    // route all agree. This also lets a later mirror recover from an unrelated
    // object returned by an earlier mirror.
    try {
      const mirrorResponse = await mirrorGet(
        '/songs/' + encodeURIComponent(providerId),
        response => {
          const songData = findMirrorSong(response, providerId);
          return !!audioResultFromMirror(songData, quality, wanted);
        }
      );
      const songData = findMirrorSong(mirrorResponse, providerId);
      const result = audioResultFromMirror(songData, quality, wanted);
      if (result) return result;
    } catch (_) {}

    // 2. Direct JioSaavn API + DES-ECB decryption. Never use the first object
    // in an untrusted response unless its provider id matches exactly.
    try {
      const jioRes = await directJioSaavn({
        '__call': 'song.getDetails',
        'pids': providerId
      });
      const songData = findJioSong(jioRes, providerId);
      if (songData && usableTrackMetadata(songData) &&
          (!wanted || matchesTrackIdentity(wanted, songData))) {
        const encUrl = songData.more_info?.encrypted_media_url;
        if (encUrl) {
          const dec = decryptMediaUrl(encUrl);
          if (dec && dec.indexOf('http') === 0) {
            let streamUrl = dec;
            if (String(quality || 'high').toLowerCase().indexOf('320') !== -1 ||
                String(quality || 'high').toLowerCase().indexOf('high') !== -1) {
              streamUrl = dec.replace('_96.mp4', '_320.mp4')
                .replace('_160.mp4', '_320.mp4')
                .replace('_48.mp4', '_320.mp4');
            }
            const track = toTrack(songData);
            if (track) {
              return ok({
                url: streamUrl,
                headers: {},
                mimeType: 'audio/mp4',
                extension: 'mp4',
                title: track.title,
                artist: track.artist,
                album: track.album || '',
                artwork: track.image || '',
                durationSeconds: track.durationSeconds,
                quality: quality || 'high'
              });
            }
          }
        }
      }
    } catch (_) {}
    return null;
  }

  // Positive/negative artist lookup metadata only; never retain audio routes.
  const artistQueries = new Map();
  async function exactArtist(term) {
    const key = canonicalIdentityText(term);
    const cached = artistQueries.get(key);
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.artist;
    const response = await mirrorGet('/search/artists?query=' + encodeURIComponent(term) + '&page=1&limit=10');
    const rows = response?.data?.results || response?.results;
    if (!Array.isArray(rows)) return null; // Do not cache transport failure.
    const matches = rows.filter(row => row.id && canonicalIdentityText(row.name || '') === key);
    // Ambiguous names stay general searches rather than guessing an identity.
    const artist = matches.length === 1 ? { id: String(matches[0].id), name: String(matches[0].name) } : null;
    artistQueries.set(key, { at: Date.now(), artist });
    while (artistQueries.size > 24) artistQueries.delete(artistQueries.keys().next().value);
    return artist;
  }

  function creditedArtist(item, artist) {
    const credits = item?.artists?.primary;
    if (Array.isArray(credits)) {
      return credits.some(credit => String(credit.id) === artist.id &&
        canonicalIdentityText(credit.name || '') === canonicalIdentityText(artist.name));
    }
    const text = item?.primaryArtists || item?.primary_artists || item?.artist || '';
    return String(text).split(/[,;&]/).some(name => canonicalIdentityText(name) === canonicalIdentityText(artist.name));
  }

  function toAlbum(item) {
    if (!item?.id || !(item.name || item.title)) return null;
    let image = item.image || item.imageUrl;
    if (Array.isArray(image)) image = image[image.length - 1]?.url;
    const artist = Array.isArray(item.artists?.primary)
      ? item.artists.primary.map(credit => credit.name).join(', ')
      : String(item.primaryArtists || item.artist || '');
    const kind = String(item.releaseType || item.record_type || '').toLowerCase();
    return {
      type: 'album', id: 'album:' + item.id, title: String(item.name || item.title), artist, image,
      year: item.year ? String(item.year) : undefined,
      trackCount: Number(item.songCount) || undefined,
      // The upstream generic `type: album` includes singles. Do not invent
      // a release classification from that container type or a track count.
      releaseType: ['album', 'single', 'ep'].includes(kind) ? kind : 'unknown'
    };
  }

  async function artistCatalogue(artist, page) {
    const base = '/artists/' + encodeURIComponent(artist.id);
    const suffix = '?page=' + page + '&sortBy=popularity&sortOrder=desc';
    // Artist endpoints are zero-based (song keyword search is one-based).
    // Sequential calls respect the runtime's bounded provider concurrency.
    const songs = await mirrorGet(base + '/songs' + suffix);
    const albums = await mirrorGet(base + '/albums' + suffix);
    if (!Array.isArray(songs?.data?.songs) || !Array.isArray(albums?.data?.albums)) {
      return fail('Artist catalogue is temporarily unavailable. Retry this page.');
    }
    const tracks = songs.data.songs.slice(0, 40).filter(item => creditedArtist(item, artist)).map(toTrack).filter(Boolean);
    const releases = albums.data.albums.slice(0, 40).filter(item => creditedArtist(item, artist)).map(toAlbum).filter(Boolean);
    return ok([...releases, ...tracks]);
  }

  async function searchResults(query, page) {
    const term = String(query || '').trim();
    if (!term) return ok([]);
    const pageIndex = Math.max(0, Math.min(59, Math.floor(Number(page) || 0)));
    const artist = await exactArtist(term);
    if (artist) return artistCatalogue(artist, pageIndex);
    return searchSongs(term, pageIndex);
  }

  async function searchSongs(query, page) {
    const term = String(query || '').trim();
    if (!term) return ok([]);
    const pageIndex = Math.max(0, Math.min(59, Math.floor(Number(page) || 0)));

    // 1. Try ListenFree mirrors
    try {
      const p = pageIndex + 1;
      const res = await mirrorGet('/search/songs?query=' + encodeURIComponent(term) + '&page=' + p + '&limit=24');
      const results = res?.data?.results || res?.results || [];
      if (results.length) {
        return ok(results.map(toTrack).filter(Boolean));
      }
    } catch (_) {}

    // 2. Try direct JioSaavn API
    try {
      const p = pageIndex + 1;
      const jio = await directJioSaavn({
        '__call': 'search.getSongSearchResults',
        'q': term,
        'p': p,
        'n': 24
      });
      const results = jio?.results || jio?.songs?.data || [];
      if (results.length) {
        return ok(results.map(toTrack).filter(Boolean));
      }
    } catch (_) {}

    return ok([]);
  }

  async function extractAudioUrl(trackId, quality) {
    const input = String(trackId || '').trim();
    const queryForFallback = input.startsWith('catalogue:')
      ? parseTrackQuery(input)
      : null;

    // Direct IDs have no independent wanted metadata at this boundary. They
    // can use only an exact provider-id response; searching an opaque ID would
    // make an unrelated result appear to be a match.
    if (!queryForFallback && !input.startsWith('catalogue:')) {
      const providerId = providerIdFromTrackId(input);
      const direct = await resolveProviderTrack(providerId, quality, null);
      if (direct) return direct;
      return fail('No authorised full-length route is available for this track.');
    }

    // Catalogue IDs are metadata-only and must resolve through an exact,
    // source-owned search result. A malformed or title-only catalogue id is
    // intentionally not guessed.
    if (queryForFallback) {
      try {
        const searchRes = await searchSongs(queryForFallback.query, 0);
        if (searchRes.ok) {
          const items = JSON.parse(searchRes.data);
          const seen = new Set();
          let attempts = 0;
          const boundedItems = Array.isArray(items)
            ? items.slice(0, MAX_FALLBACK_SEARCH_RESULTS)
            : [];
          for (const item of boundedItems) {
            if (attempts >= MAX_FALLBACK_CANDIDATES ||
                !matchesTrackIdentity(queryForFallback, item)) continue;
            const providerId = providerIdFromTrackId(item.id);
            if (!providerId || seen.has(providerId)) continue;
            seen.add(providerId);
            attempts++;
            const resolved = await resolveProviderTrack(
              providerId,
              quality,
              queryForFallback
            );
            if (resolved) return resolved;
          }
        }
      } catch (_) {}
    }

    return fail('No authorised full-length route is available for this track.');
  }

  async function extractDetails(id) {
    const cleanId = String(id || '').replace(/^(album|playlist|synthetiq_music_gateway):/, '').trim();
    try {
      const res = await mirrorGet('/albums?id=' + encodeURIComponent(cleanId));
      const data = res?.data;
      if (data && String(data.id) === cleanId) {
        const tracks = (data.songs || []).map(toTrack).filter(Boolean);
        const album = toAlbum(data);
        if (album) return ok({ ...album, tracks });
      }
    } catch (_) {}
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
    const queries = [
      { title: 'Top Hits & Trending', query: 'top hits' },
      { title: 'New Releases', query: 'latest songs' },
      { title: 'Popular Worldwide', query: 'global hits' }
    ];
    for (const row of queries) {
      const result = await searchResults(row.query, 0);
      if (result.ok) {
        const items = JSON.parse(result.data);
        if (items.length) sections.push({ title: row.title, type: 'track', items: items.slice(0, 12) });
      }
    }
    return sections.length ? ok(sections) : fail('Music discovery is temporarily unavailable.');
  }

  async function radioSuggestions(seedId) {
    const id = providerIdFromTrackId(seedId);
    if (!id || id.includes(':')) throw new Error('Invalid seed identity');
    const res = await mirrorGet('/songs/' + encodeURIComponent(id) + '/suggestions?limit=40');
    if (!res) throw new Error('Suggestions unavailable');
    const rows = Array.isArray(res?.data) ? res.data : res?.data?.results;
    if (!Array.isArray(rows)) throw new Error('Invalid suggestions response');
    const seen = new Set([id]);
    return (Array.isArray(rows) ? rows : []).filter(row => {
      const key = String(row.id || '');
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    }).map(toTrack).filter(Boolean).slice(0, 40);
  }

  async function getRelatedTracks(seedId) {
    try { return ok(await radioSuggestions(seedId)); }
    catch (_) { return ok([]); }
  }

  // Experimental metadata adapters. No audio URLs, credentials, listening
  // history or queue state enter this cache. The application owns the session.
  const RADIO_TTL = 30 * 60 * 1000;
  const RADIO_ALGORITHM = 'session_based_days_7500_session_300_contribution_5_threshold_15_limit_50_skip_30';
  const radioStates = new Map();
  const radioRequests = new Map();
  let radioSerial = 0;
  let radioMirrorIndex = 0;
  let musicBrainzAt = 0;
  const mbidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  async function radioJson(url) {
    // The native bridge cancels this request on expiry. Do not emulate this
    // with Promise.race: that would leave a live request behind the runtime.
    const response = await fetch(url, { method: 'GET', timeoutMs: 2000, headers: {
      Accept: 'application/json',
      'User-Agent': 'SynthetiqMusicTest/1.4.4 (https://github.com/kas021/Synthetic-Music-Connectors)'
    }});
    if (response.status !== 200) throw new Error('Recommendation metadata unavailable');
    return response.json();
  }

  async function radioMirror(state, path) {
    // One request per operation: four source operations fit the app's ten
    // second refill budget. Rotate after failure for the next retry, without
    // recursively running the playback waterfall during metadata work.
    try {
      const data = await radioJson(MIRRORS[state.mirror] + path);
      if (!data || !data.data) throw new Error('Invalid catalogue metadata');
      radioMirrorIndex = state.mirror;
      return data;
    } catch (_) {
      radioMirrorIndex = (state.mirror + 1) % MIRRORS.length;
    }
    throw new Error('Recommendation catalogue unavailable');
  }

  function radioKey(track) {
    return canonicalIdentityText(track.title) + '|' +
      canonicalIdentityText(primaryArtist(track.artist));
  }

  function radioItem(state, track, provider, rank) {
    if (!track || !usableTrackMetadata(track) || track.title.length > 300 ||
        track.artist.length > 300 || track.id.length > 256 ||
        providerIdFromTrackId(track.id) === state.id) return null;
    const key = radioKey(track);
    if (state.seen.has(key) || state.ids.has(track.id)) return null;
    state.seen.add(key);
    state.ids.add(track.id);
    return { track, relationship: 'sourceSuggestion', providerRank: rank,
      recommendationProvider: provider };
  }

  function takeNative(state, count) {
    const items = [];
    while (items.length < count && state.nativeIndex < state.native.length) {
      const rank = state.nativeIndex++;
      const item = radioItem(state, state.native[rank], 'jiosaavn', rank);
      if (item) items.push(item);
    }
    return items;
  }

  async function findRecording(state) {
    const seed = state.seed;
    // One request per second at most; do not sleep while owning the JS runtime.
    if (Date.now() - musicBrainzAt < 1100) throw new Error('Metadata rate limited');
    musicBrainzAt = Date.now();
    const quote = value => String(value).replace(/[\\"]/g, '\\$&');
    const query = 'recording:"' + quote(seed.title) + '" AND artist:"' +
      quote(primaryArtist(seed.artist)) + '"';
    const body = await radioJson('https://musicbrainz.org/ws/2/recording/?fmt=json&limit=10&query=' + encodeURIComponent(query));
    if (!Array.isArray(body?.recordings)) throw new Error('Invalid recording lookup');
    const exact = body.recordings.slice(0, 10).filter(row => {
      if (!mbidPattern.test(row.id || '') || String(row.disambiguation || '').trim()) return false;
      const artist = row['artist-credit']?.[0]?.name;
      if (!matchesTrackIdentity(seed, { title: row.title, artist })) return false;
      const seconds = Number(row.length) / 1000;
      // Duration disambiguates e.g. the 174-second edit from the 187-second
      // One Dance recording. An absent duration cannot prove that match.
      return !seed.durationSeconds ||
        (seconds > 0 && Math.abs(seconds - seed.durationSeconds) <= 5);
    });
    const ids = [...new Set(exact.map(row => row.id))];
    return ids.length === 1 ? ids[0] : null;
  }

  async function listenBrainzCandidates(state) {
    const rows = await radioJson('https://labs.api.listenbrainz.org/similar-recordings/json?recording_mbids=' +
      encodeURIComponent(state.mbid) + '&algorithm=' + RADIO_ALGORITHM);
    if (!Array.isArray(rows)) throw new Error('Invalid similar-recordings response');
    const seen = new Set();
    return rows.slice(0, 50).filter(row => {
      // Check the response's anchor, not merely its shape. A cached response
      // for another recording must not start an unrelated recommendation path.
      if (row.reference_mbid !== state.mbid || !mbidPattern.test(row.recording_mbid || '') ||
          row.recording_mbid === state.mbid || seen.has(row.recording_mbid) ||
          typeof row.recording_name !== 'string' || row.recording_name.length > 300 ||
          typeof row.artist_credit_name !== 'string' || row.artist_credit_name.length > 300) return false;
      seen.add(row.recording_mbid);
      return usableTrackMetadata({ title: row.recording_name, artist: row.artist_credit_name });
    }).slice(0, 40).map((row, rank) => ({
      title: row.recording_name, artist: row.artist_credit_name,
      mbid: row.recording_mbid, rank
    }));
  }

  async function mapRecommendation(state, wanted) {
    const response = await radioMirror(state, '/search/songs?query=' +
      encodeURIComponent(wanted.title + ' ' + primaryArtist(wanted.artist)) + '&page=1&limit=10');
    const rows = response?.data?.results;
    if (!Array.isArray(rows)) throw new Error('Invalid candidate search');
    // Strict matching, no first-result fallback, no live/remix stripping. Use
    // source-owned metadata, never label a provider recording with LB's title.
    const exact = rows.slice(0, 10).filter(row => matchesTrackIdentity(wanted, row));
    const track = exact.map(toTrack).find(Boolean);
    return radioItem(state, track, 'listenbrainz', wanted.rank);
  }

  async function hybridRadio(seedId, cursor) {
    const id = providerIdFromTrackId(seedId);
    if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return fail('Invalid radio seed');
    const now = Date.now();
    for (const [key, value] of radioStates) {
      if (now - value.at >= RADIO_TTL || (value.retryAt && now >= value.retryAt)) radioStates.delete(key);
    }
    let state = radioStates.get(id);
    let step = 0;
    if (cursor) {
      const match = typeof cursor === 'string' && cursor.match(/^lb1\.([a-z0-9-]{1,40})\.(\d{1,2})$/);
      if (!match) return fail('Invalid radio cursor');
      if (state && match[1] !== state.token) return fail('Radio cursor belongs to another session');
      if (state) step = Number(match[2]);
      // Cache lost on native runtime recreation or TTL: restart bounded pages.
      // The app retains session exclusions, so this can never authorize repeats.
    }
    if (!state) {
      state = { id, at: now, token: now.toString(36) + '-' + (++radioSerial).toString(36),
        mirror: radioMirrorIndex, phase: 'native', native: [], nativeIndex: 0, similar: [],
        similarIndex: 0, seen: new Set(), ids: new Set(), pages: [] };
      radioStates.set(id, state);
      while (radioStates.size > 4) radioStates.delete(radioStates.keys().next().value);
    }
    if (state.pages[step]) return state.pages[step]; // Idempotent cursor replay.
    if (step !== state.pages.length || step > 47) return fail('Radio cursor is out of sequence');
    let items = [];
    try {
      if (state.phase === 'native') {
        const response = await radioMirror(state, '/songs/' + encodeURIComponent(id) + '/suggestions?limit=40');
        const rows = Array.isArray(response.data) ? response.data : response.data.results;
        if (!Array.isArray(rows)) throw new Error('Invalid suggestions');
        state.native = rows.slice(0, 80).map(toTrack).filter(Boolean).slice(0, 40);
        items = takeNative(state, 6);
        state.phase = 'seed';
      } else if (state.phase === 'seed') {
        const response = await radioMirror(state, '/songs/' + encodeURIComponent(id));
        const row = findMirrorSong(response, id);
        state.seed = row && usableTrackMetadata(row) ? toTrack(row) : null;
        state.phase = state.seed ? 'mbid' : 'remaining';
      } else if (state.phase === 'mbid') {
        state.mbid = await findRecording(state);
        state.phase = state.mbid ? 'similar' : 'remaining';
      } else if (state.phase === 'similar') {
        state.similar = await listenBrainzCandidates(state);
        state.phase = 'mapping';
      } else if (state.phase === 'mapping' && state.similarIndex < state.similar.length) {
        // One candidate and one request per operation. Yield to
        // playback between operations instead of doing fifty searches at once.
        const item = await mapRecommendation(state, state.similar[state.similarIndex]);
        state.similarIndex++;
        if (item) items.push(item);
      }
    } catch (_) {
      if (state.phase === 'native') {
        radioStates.delete(id);
        return fail('Related tracks temporarily unavailable');
      }
      // An optional engine outage must not discard native suggestions. Short
      // cooldown, not a permanent cached empty result; a new request can retry.
      state.retryAt = Date.now() + 30000;
      state.phase = 'remaining';
    }
    items.push(...takeNative(state, 2));
    const more = state.nativeIndex < state.native.length ||
      ['seed', 'mbid', 'similar'].includes(state.phase) ||
      (state.phase === 'mapping' && state.similarIndex < state.similar.length);
    const result = ok({ version: 1, items, nextCursor: more && step < 47
      ? 'lb1.' + state.token + '.' + (step + 1) : null });
    state.pages.push(result);
    return result;
  }

  async function getRadioCandidates(seedId, cursor) {
    if (globalThis.__synthetiqBoundedFetchVersion === 1) {
      const key = String(seedId) + '\n' + String(cursor || '');
      if (radioRequests.has(key)) return radioRequests.get(key);
      if (radioRequests.size) return fail('Radio metadata is busy; retry');
      const call = hybridRadio(seedId, cursor);
      radioRequests.set(key, call);
      try { return await call; } finally { radioRequests.delete(key); }
    }
    // Older installed apps retain the proven native-only path. The additional
    // provider requests require the host's shorter, cancellable fetch contract.
    if (cursor) return ok({version: 1, items: [], nextCursor: null});
    try {
      const tracks = await radioSuggestions(seedId);
      return ok({version: 1, items: tracks.map(track => ({
        track, relationship: 'sourceSuggestion'
      })), nextCursor: null});
    } catch (_) { return fail('Related tracks temporarily unavailable'); }
  }
  globalThis.getRadioCandidates = getRadioCandidates;

  globalThis.searchResults = searchResults;
  globalThis.homeSections = homeSections;
  globalThis.extractDetails = extractDetails;
  globalThis.extractTracks = extractTracks;
  globalThis.extractAudioUrl = extractAudioUrl;
  globalThis.getRelatedTracks = getRelatedTracks;
})();
