const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, '../modules/freefy/index.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(__dirname, '../modules/freefy/manifest.json'), 'utf8'));

function load(route) {
  const requests = [];
  const context = vm.createContext({
    fetch: async (url, options) => {
      requests.push(String(url));
      return { status: 200, json: async () => route(String(url), options) };
    },
  });
  vm.runInContext(source, context);
  return { context, requests };
}

test('Freefy staging manifest opts into only the implemented album capability', () => {
  assert.equal(manifest.moduleVersion, '1.0.2');
  assert.equal(manifest.releaseTrack, 'staging');
  assert.equal(manifest.config.capabilities.music_album_search_v1, true);
});

test('Freefy album search uses only the supported ListenFree album endpoint', async () => {
  const { context, requests } = load(url => url.includes('/search/albums')
    ? { data: { results: [{ id: 'release-1', name: 'Release', primaryArtists: 'Artist', songCount: 12 }] } }
    : {});
  const result = await context.searchAlbums('Release', 2);
  assert.equal(result.ok, true);
  const album = JSON.parse(result.data)[0];
  assert.equal(album.id, 'album:release-1');
  assert.equal(album.type, 'album');
  assert.equal(album.trackCount, 12);
  assert.match(requests[0], /search\/albums\?query=Release&page=3&limit=20/);
  assert.ok(requests.every(url => !url.includes('youtube.com')));
});

test('Freefy album details require the requested provider release ID', async () => {
  const { context, requests } = load(url => {
    if (!url.includes('/albums?id=')) return {};
    return {
      data: {
        id: 'different-release',
        name: 'Wrong Release',
        songs: [],
      },
    };
  });
  const result = await context.extractDetails('album:requested-release');
  assert.equal(result.ok, false);
  assert.equal(requests.length, 3);
  assert.ok(requests.every(url => url.includes('albums?id=requested-release')));
});

test('Freefy album details return the matching release and track list', async () => {
  const { context } = load(url => url.includes('/albums?id=release-1')
    ? { data: { id: 'release-1', name: 'Release', primaryArtists: 'Artist', songCount: 1, songs: [{ id: 'song-1', name: 'Song', primaryArtists: 'Artist' }] } }
    : {});
  const result = await context.extractDetails('album:release-1');
  assert.equal(result.ok, true);
  const album = JSON.parse(result.data);
  assert.equal(album.id, 'album:release-1');
  assert.equal(album.trackCount, 1);
  assert.equal(album.tracks[0].id, 'freefy:saavn:song-1');
});
