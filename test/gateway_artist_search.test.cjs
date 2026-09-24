const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../modules/synthetiq_music_gateway/index.js'), 'utf8');

const credit = { id: '512453', name: 'Drake' };
function song(id, name, primary = [credit]) {
  return { id, name, artists: { primary }, album: { id: 'views', name: 'Views' } };
}
function runtime(route) {
  const requests = [];
  const context = vm.createContext({ fetch: async (raw) => {
    const url = new URL(raw);
    requests.push(url);
    const data = route(url);
    return { status: data === null ? 503 : 200, json: async () => ({ success: true, data }) };
  }});
  vm.runInContext(source, context);
  return { context, requests };
}
const decode = result => {
  assert.equal(result.ok, true);
  return JSON.parse(result.data);
};

test('exact artist search uses zero-based catalogue pages and preserves album IDs', async () => {
  const { context, requests } = runtime(url => {
    if (url.pathname.endsWith('/search/artists')) return { results: [credit] };
    if (url.pathname.endsWith('/songs')) {
      const page = url.searchParams.get('page');
      return { songs: [song('song-' + page, 'Song ' + page), song('unrelated', 'Drake', [{ id: '999', name: 'NAST' }])] };
    }
    return { albums: [{ id: 'views', name: 'Views', songCount: 20, artists: { primary: [credit] } }] };
  });
  const first = decode(await context.searchResults('Drake', 0));
  const second = decode(await context.searchResults('Drake', 1));
  assert.deepEqual(first.map(x => x.id), ['album:views', 'synthetiq_music_gateway:song:song-0']);
  assert.deepEqual(second.map(x => x.id), ['album:views', 'synthetiq_music_gateway:song:song-1']);
  assert.equal(first[1].albumId, 'album:views');
  assert.equal(first[0].releaseType, 'unknown');
  assert.equal(requests.filter(u => u.pathname.endsWith('/search/artists')).length, 1);
  assert.equal(requests.some(u => u.pathname.endsWith('/search/songs')), false);
});

test('collaborations remain eligible but wrong provider artist IDs do not', async () => {
  const { context } = runtime(url => {
    if (url.pathname.endsWith('/search/artists')) return { results: [credit] };
    if (url.pathname.endsWith('/albums')) return { albums: [] };
    return { songs: [song('collab', 'DIE TRYING', [{ id: 'pnd', name: 'PARTYNEXTDOOR' }, credit]), song('wrong', 'Wrong', [{ id: 'other', name: 'Drake' }])] };
  });
  const rows = decode(await context.searchResults('Drake', 0));
  assert.deepEqual(rows.map(x => x.title), ['DIE TRYING']);
});

test('ambiguous artist names preserve ordinary one-based song search', async () => {
  const { context, requests } = runtime(url => url.pathname.endsWith('/search/artists')
    ? { results: [credit, { ...credit, id: 'other-drake' }] }
    : { results: [song('title', 'Drake', [{ id: 'nast', name: 'NAST' }])] });
  const rows = decode(await context.searchResults('Drake', 2));
  assert.equal(rows[0].artist, 'NAST');
  assert.equal(requests.at(-1).searchParams.get('page'), '3');
});

test('artist page failures stay retryable and never become title-match filler', async () => {
  let broken = true;
  const { context, requests } = runtime(url => {
    if (url.pathname.endsWith('/search/artists')) return { results: [credit] };
    if (broken) return null;
    return url.pathname.endsWith('/songs') ? { songs: [song('right', 'One Dance')] } : { albums: [] };
  });
  assert.equal((await context.searchResults('Drake', 0)).ok, false);
  broken = false;
  assert.equal(decode(await context.searchResults('Drake', 0)).length, 1);
  assert.equal(requests.some(u => u.pathname.endsWith('/search/songs')), false);
});

test('empty artist pages terminate honestly', async () => {
  const { context } = runtime(url => url.pathname.endsWith('/search/artists')
    ? { results: [credit] }
    : url.pathname.endsWith('/songs') ? { songs: [] } : { albums: [] });
  assert.deepEqual(decode(await context.searchResults('Drake', 7)), []);
});

test('album click returns real tracks and rejects mismatched release response', async () => {
  let wrong = false;
  const { context } = runtime(() => ({ id: wrong ? 'other' : 'views', name: 'Views', artists: { primary: [credit] }, songs: [song('one', 'One Dance')] }));
  const album = decode(await context.extractDetails('album:views'));
  assert.equal(album.artist, 'Drake');
  assert.equal(album.tracks[0].title, 'One Dance');
  wrong = true;
  assert.equal((await context.extractDetails('album:views')).ok, false);
});
