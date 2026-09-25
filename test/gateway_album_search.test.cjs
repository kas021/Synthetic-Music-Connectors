const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '../modules/synthetiq_music_gateway/index.js'),
  'utf8',
);
const manifest = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../modules/synthetiq_music_gateway/module.json'),
  'utf8',
));

function runtime(route) {
  const requests = [];
  const context = vm.createContext({
    fetch: async raw => {
      const url = new URL(raw);
      requests.push(url);
      const data = route(url);
      return {
        status: data === null ? 503 : 200,
        json: async () => ({ success: true, data }),
      };
    },
  });
  vm.runInContext(source, context);
  return { context, requests };
}

const decode = result => {
  assert.equal(result.ok, true);
  return JSON.parse(result.data);
};

test('Gateway staging manifest explicitly opts into album search v1', () => {
  assert.equal(manifest.moduleVersion, '1.4.5');
  assert.equal(manifest.config.capabilities.music_album_search_v1, true);
});

test('exact artist album search uses bounded zero-based pages and exact credits', async () => {
  const artist = { id: '512453', name: 'Drake' };
  const { context, requests } = runtime(url => {
    if (url.pathname.endsWith('/search/artists')) return { results: [artist] };
    if (url.pathname.endsWith('/albums')) {
      return {
        albums: [
          { id: 'release-2', name: 'Release 2', artists: { primary: [artist] } },
          { id: 'wrong-credit', name: 'Wrong', artists: { primary: [{ id: 'other', name: 'Drake' }] } },
        ],
      };
    }
    return null;
  });

  const albums = decode(await context.searchAlbums('Drake', 2));
  assert.deepEqual(albums.map(album => album.id), ['album:release-2']);
  assert.equal(albums[0].type, 'album');
  assert.equal(requests.find(url => url.pathname.endsWith('/albums')).searchParams.get('page'), '2');
  assert.equal(requests.some(url => url.pathname.endsWith('/songs')), false);
});

test('general album search uses one-based provider paging and rejects empty query', async () => {
  const { context, requests } = runtime(url => {
    if (url.pathname.endsWith('/search/artists')) return { results: [] };
    if (url.pathname.endsWith('/search/albums')) {
      return { results: [{ id: 'album-1', name: 'Some Album', primaryArtists: 'Artist' }] };
    }
    return null;
  });

  assert.deepEqual(decode(await context.searchAlbums('Some Album', 2)).map(a => a.id), ['album:album-1']);
  assert.equal(requests.find(url => url.pathname.endsWith('/search/albums')).searchParams.get('page'), '3');
  const count = requests.length;
  assert.deepEqual(decode(await context.searchAlbums('   ', 0)), []);
  assert.equal(requests.length, count);
});
