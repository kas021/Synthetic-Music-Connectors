const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../modules/synthetiq_music_gateway/index.js'), 'utf8');
const song = (id, name = 'i need u', artist = 'Ken Carson', extra = {}) => ({
  id, name, primaryArtists: artist, duration: 149, album: {name: 'i need u'}, ...extra,
});
const catalogueId = title => 'catalogue:' + Buffer.from(title + '\0Ken Carson').toString('base64').replace(/=+$/, '');
function load(route) {
  const calls = [];
  const context = vm.createContext({fetch: async (url, options) => {
    const uri = new URL(url); calls.push({uri, options});
    const body = await route(uri);
    return {status: body == null ? 503 : 200, json: async () => body || {}};
  }});
  vm.runInContext(source, context);
  return {context, calls};
}
function route(uri, {fresh, page = 0, studio = song('dO3xkCIZ')} = {}) {
  if (uri.pathname.endsWith('/search/artists')) return {data: {results:
    uri.searchParams.get('query') === 'Ken Carson' ? [{id: 'ken', name: 'Ken Carson'}] : []}};
  if (uri.pathname.endsWith('/search/songs')) return {data: {results:
    [song('cover', 'I Need U (Originally Performed by Ken Carson)', 'Backing Business')]}};
  if (uri.pathname.endsWith('/artists/ken/songs')) return {data: {songs:
    Number(uri.searchParams.get('page')) === page ? [studio] : [song('other', 'Other Song')]}};
  if (uri.pathname.endsWith('/songs/dO3xkCIZ')) return {data: fresh || {
    ...studio, downloadUrl: [{quality: '320kbps', url: 'https://media.example.test/full.mp4'}]}};
  return {data: {results: []}};
}
test('saved unpadded i need u ID recovers verified Ken Carson route, not karaoke', async () => {
  const {context, calls} = load(uri => route(uri));
  const result = await context.extractAudioUrl(catalogueId('i need u'), 'high');
  assert.equal(result.ok, true);
  const audio = JSON.parse(result.data);
  assert.equal(audio.title, 'i need u'); assert.equal(audio.artist, 'Ken Carson');
  assert.equal(audio.durationSeconds, 149);
  assert.ok(calls.length <= 8);
  assert.ok(calls.every(c => c.options.timeoutMs > 0 && c.options.timeoutMs <= 3000));
});
test('structured search puts exact studio identity first and removes unrelated artists', async () => {
  const {context} = load(uri => route(uri));
  const rows = JSON.parse((await context.searchResults('i need u Ken Carson', 0)).data);
  assert.equal(rows[0].id, 'synthetiq_music_gateway:song:dO3xkCIZ');
  assert.ok(rows.every(row => row.artist === 'Ken Carson'));
});
test('deep cut recovery uses real artist pages without cycling page zero', async () => {
  const {context, calls} = load(uri => route(uri, {page: 2}));
  assert.equal((await context.extractAudioUrl(catalogueId('i need u'), 'high')).ok, true);
  assert.deepEqual(calls.filter(c => c.uri.pathname.endsWith('/artists/ken/songs')).map(c => c.uri.searchParams.get('page')), ['0', '1', '2']);
});
for (const extra of [{name: 'i need u (Live)'}, {name: 'i need u (Karaoke)'},
  {primaryArtists: 'Another Artist'}]) {
  test('recovery rejects changed recording ' + JSON.stringify(extra), async () => {
    const {context} = load(uri => route(uri, {studio: song('dO3xkCIZ', 'i need u', 'Ken Carson', extra)}));
    assert.equal((await context.extractAudioUrl(catalogueId('i need u'), 'high')).ok, false);
  });
}
test('detail response cannot substitute a wrong track after verified search', async () => {
  const {context} = load(uri => route(uri, {fresh: song('dO3xkCIZ', 'Different Song', 'Different Artist')}));
  assert.equal((await context.extractAudioUrl(catalogueId('i need u'), 'high')).ok, false);
});
test('detail response cannot change the selected recording duration', async () => {
  const {context} = load(uri => route(uri, {fresh: {
    ...song('dO3xkCIZ', 'i need u', 'Ken Carson', {duration: 300}),
    downloadUrl: [{quality: '320kbps', url: 'https://media.example.test/full.mp4'}],
  }}));
  assert.equal((await context.extractAudioUrl(catalogueId('i need u'), 'high')).ok, false);
});
test('selected ISRC cannot change at the detail boundary', async () => {
  const studio = song('dO3xkCIZ', 'i need u', 'Ken Carson', {isrc: 'USUM72301234'});
  const {context} = load(uri => route(uri, {studio, fresh: {
    ...studio, isrc: 'USUM72305678',
    downloadUrl: [{quality: '320kbps', url: 'https://media.example.test/full.mp4'}],
  }}));
  assert.equal((await context.extractAudioUrl(catalogueId('i need u'), 'high')).ok, false);
});
test('HTTPS alternative is selected instead of an insecure higher-quality route', async () => {
  const {context} = load(uri => route(uri, {fresh: {
    ...song('dO3xkCIZ'), downloadUrl: [
      {quality: '128kbps', url: 'https://media.example.test/full.mp4'},
      {quality: '320kbps', url: 'http://media.example.test/insecure.mp4'},
    ],
  }}));
  const result = await context.extractAudioUrl(catalogueId('i need u'), 'high');
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(result.data).url, 'https://media.example.test/full.mp4');
});
test('outage has bounded requests and transient recovery is retried', async () => {
  let down = true;
  const {context, calls} = load(uri => down ? null : route(uri));
  assert.equal((await context.extractAudioUrl(catalogueId('i need u'), 'high')).ok, false);
  assert.ok(calls.length <= 8);
  down = false;
  assert.equal((await context.extractAudioUrl(catalogueId('i need u'), 'high')).ok, true);
});
test('foreign provider ID fails without searching or network', async () => {
  const {context, calls} = load(uri => route(uri));
  assert.equal((await context.extractAudioUrl('freefy:yt:foreign-id', 'high')).ok, false);
  assert.equal(calls.length, 0);
});
test('search pagination remains distinct after first-page recovery', async () => {
  const {context, calls} = load(uri => route(uri));
  await context.searchResults('i need u Ken Carson', 1);
  assert.ok(calls.some(c => c.uri.pathname.endsWith('/search/songs') && c.uri.searchParams.get('page') === '2'));
  assert.equal(calls.some(c => c.uri.pathname.includes('/artists/ken/songs')), false);
});
test('artist-word suffix must not blank an ordinary search with no verified recording', async () => {
  const {context} = load(uri => {
    if (uri.pathname.endsWith('/search/artists')) return {data: {results:
      uri.searchParams.get('query') === 'Love' ? [{id: 'love', name: 'Love'}] : []}};
    if (uri.pathname.endsWith('/search/songs')) return {data: {results: [song('valid', 'Songs About Love', 'Different Artist')]}};
    return {data: {songs: []}};
  });
  const result = await context.searchResults('Songs About Love', 0);
  assert.equal(JSON.parse(result.data)[0].title, 'Songs About Love');
});
test('internal Home searches cannot enter unbudgeted recovery', async () => {
  const {context, calls} = load(uri => route(uri));
  await context.homeSections(0);
  const artists = calls.filter(c => c.uri.pathname.endsWith('/search/artists'));
  assert.deepEqual(artists.map(c => c.uri.searchParams.get('query')), ['top hits', 'latest songs', 'global hits']);
  assert.equal(calls.some(c => c.uri.pathname.includes('/artists/')), false);
});
test('unexpected handler errors become sanitized failures and release the lookup lock', async () => {
  const {context} = load(uri => route(uri));
  vm.runInContext('Array.prototype.filter = function(){ throw new Error("private internal failure"); };', context);
  const result = await context.searchResults('i need u Ken Carson', 0);
  assert.equal(result.ok, false);
  assert.equal(result.error.message, 'Source lookup failed. Retry.');
  vm.runInContext('delete Array.prototype.filter;', context);
  // The next call is not rejected as permanently busy after that exception.
  const next = await context.extractAudioUrl('freefy:yt:foreign', 'high');
  assert.ok(!next.error.message.includes('busy'));
});
