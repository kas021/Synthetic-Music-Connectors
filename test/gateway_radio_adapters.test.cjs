const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../modules/synthetiq_music_gateway/index.js'), 'utf8');
const seedMbid = 'b5c7eaa8-95c7-4b5c-9818-0e063e839839';
const recommendationMbid = '822520c1-fa7b-406a-80e5-bc20ee583767';
const song = (id, title, artist = 'Drake', duration = 187) => ({
  id, name: title, primaryArtists: artist, duration, album: { id: 'views', name: 'Views' }
});
const seed = song('seed', 'One Dance');
const native = Array.from({length: 40}, (_, i) => song('native' + i, 'Native ' + i, 'Artist ' + i));
const mbRow = { id: seedMbid, title: 'One Dance', length: 187000, 'artist-credit': [{name:'Drake'}] };
const lbRow = { recording_mbid: recommendationMbid, reference_mbid: seedMbid,
  recording_name: 'This Is What You Came For', artist_credit_name: 'Calvin Harris feat. Rihanna' };

function fixture(overrides = {}) {
  let now = 1800000000000;
  const requests = [];
  const context = vm.createContext({
    __synthetiqBoundedFetchVersion: 1,
    Date: class extends Date { static now() { return now; } },
    fetch: async (raw, options) => {
      const url = new URL(raw);
      requests.push({ url, options });
      const custom = overrides.route && await overrides.route(url, options);
      if (custom !== undefined) return custom;
      let data;
      if (url.pathname.endsWith('/suggestions')) data = {data: overrides.native || native};
      else if (url.pathname === '/api/songs/seed') data = {data: [overrides.seed || seed]};
      else if (url.hostname === 'musicbrainz.org') data = {recordings: overrides.mb || [mbRow]};
      else if (url.hostname === 'labs.api.listenbrainz.org') data = overrides.lb || [lbRow];
      else if (url.pathname === '/api/search/songs') data = {data: {results: overrides.matches || [song('mapped', lbRow.recording_name, lbRow.artist_credit_name)]}};
      else throw new Error('Unexpected route: ' + url.pathname);
      return {status:200, json:async()=>data};
    }
  });
  vm.runInContext(source, context);
  return { context, requests, advance: ms => now += ms };
}
function decode(result) { assert.equal(result.ok, true, JSON.stringify(result)); return JSON.parse(result.data); }
async function pages(f, max = 48) {
  let cursor = null;
  const output = [];
  for (let i=0; i<max; i++) {
    const before = f.requests.length;
    const page = decode(await f.context.getRadioCandidates('synthetiq_music_gateway:song:seed', cursor));
    assert.ok(f.requests.length - before <= 1, 'at most one HTTP request per source operation');
    output.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) return output;
    assert.ok(cursor.length < 256);
  }
  assert.fail('unbounded pagination');
}

test('native and ListenBrainz suggestions map to source-owned metadata, with finite pages', async () => {
  const f = fixture();
  const items = await pages(f);
  assert.equal(items.length, 41);
  assert.equal(items.filter(x=>x.recommendationProvider==='listenbrainz').length, 1);
  assert.equal(new Set(items.map(x=>x.track.id)).size, items.length);
  assert.ok(items.every(x=>x.relationship==='sourceSuggestion'));
  assert.ok(f.requests.every(r=>r.options.timeoutMs===2000));
  assert.ok(!f.requests.some(r=>/youtube|extract|stream|download|recommended|similar music/.test(r.url.href)));
  assert.equal(f.requests.filter(r=>r.url.hostname==='musicbrainz.org').length,1);
});

test('never chooses a DJ-mix seed or an edit with a different duration', async () => {
  const f = fixture({mb: [
    {...mbRow,id:'9180a484-08fe-4e37-b756-defa8e4132d6',disambiguation:'part of DJ mix'},
    {...mbRow,id:'be9e4a6b-3f56-468a-aa61-b1bcb6fc277f',length:174000}, mbRow
  ]});
  await pages(f);
  const call = f.requests.find(r=>r.url.hostname==='labs.api.listenbrainz.org');
  assert.equal(call.url.searchParams.get('recording_mbids'),seedMbid);
});

test('ambiguous recording IDs fail closed without discarding native suggestions', async () => {
  const f = fixture({mb:[mbRow,{...mbRow,id:recommendationMbid}]});
  const items=await pages(f);
  assert.equal(items.length,40);
  assert.ok(!f.requests.some(r=>r.url.hostname==='labs.api.listenbrainz.org'));
});

test('wrong provider seed ID cannot seed ListenBrainz', async () => {
  const f=fixture({seed:song('wrong','One Dance')});
  assert.equal((await pages(f)).length,40);
  assert.ok(!f.requests.some(r=>r.url.hostname==='musicbrainz.org'));
});

test('similar response must reference the verified seed and have valid IDs', async () => {
  const f=fixture({lb:[{...lbRow,reference_mbid:recommendationMbid},{...lbRow,recording_mbid:'not-a-mbid'}]});
  assert.equal((await pages(f)).length,40);
  assert.ok(!f.requests.some(r=>r.url.pathname==='/api/search/songs'));
});

test('wrong artist and live/remix candidates never substitute for studio recommendation', async () => {
  const f=fixture({matches:[
    song('wrong',lbRow.recording_name,'Wrong Artist'),
    song('live',lbRow.recording_name+' (Live)',lbRow.artist_credit_name),
    song('remix',lbRow.recording_name+' (Remix)',lbRow.artist_credit_name)
  ]});
  assert.equal((await pages(f)).length,40);
});

test('a genuinely recommended song is allowed regardless of words in its title', async () => {
  const f=fixture({lb:[{...lbRow,recording_name:'Highly Recommended',artist_credit_name:'Helen Baylor'}],
    matches:[song('genuine','Highly Recommended','Helen Baylor')]});
  const items=await pages(f);
  assert.ok(items.some(x=>x.track.title==='Highly Recommended'));
  const queries=f.requests.filter(r=>r.url.pathname==='/api/search/songs').map(r=>r.url.searchParams.get('query'));
  assert.deepEqual(queries,['Highly Recommended Helen Baylor']);
});

test('duplicates across engines and repeated MBIDs are emitted only once', async () => {
  const f=fixture({native:[song('mapped',lbRow.recording_name,lbRow.artist_credit_name),...native],lb:[lbRow,lbRow]});
  const items=await pages(f);
  assert.equal(items.filter(x=>x.track.title===lbRow.recording_name).length,1);
  assert.equal(f.requests.filter(r=>r.url.pathname==='/api/search/songs').length,1);
});

test('same cursor replay and concurrent first requests are coalesced', async () => {
  const f=fixture();
  const [a,b]=await Promise.all([f.context.getRadioCandidates('seed',null),f.context.getRadioCandidates('seed',null)]);
  assert.deepEqual(decode(a),decode(b));
  assert.equal(f.requests.length,1);
  assert.deepEqual(decode(await f.context.getRadioCandidates('seed',null)),decode(a));
  assert.equal(f.requests.length,1);
});

test('invalid, out-of-order and foreign-session cursors cause no network work', async () => {
  const f=fixture();
  const first=decode(await f.context.getRadioCandidates('seed',null));
  assert.equal((await f.context.getRadioCandidates('seed','https://bad.test')).ok,false);
  assert.equal((await f.context.getRadioCandidates('seed',first.nextCursor.replace(/\.1$/,'.40'))).ok,false);
  assert.equal((await f.context.getRadioCandidates('seed','lb1.other.1')).ok,false);
  assert.equal(f.requests.length,1);
});

test('optional outage degrades to native and retries after a short cooldown', async () => {
  let failing=true;
  const f=fixture({route:url=>url.hostname==='musicbrainz.org'&&failing ? {status:503,json:async()=>({})}:undefined});
  assert.equal((await pages(f)).length,40);
  failing=false;
  f.advance(31000);
  assert.equal((await pages(f)).length,41);
});

test('transient native outage is not cached as empty success', async () => {
  let failing=true;
  const f=fixture({route:url=>url.pathname.endsWith('/suggestions')&&failing ? {status:503,json:async()=>({})}:undefined});
  assert.equal((await f.context.getRadioCandidates('seed',null)).ok,false);
  failing=false;
  assert.ok(decode(await f.context.getRadioCandidates('seed',null)).items.length>0);
});

test('runtime restart and expired metadata recover at a fresh bounded cursor', async () => {
  const f=fixture();
  const first=decode(await f.context.getRadioCandidates('seed',null));
  const restarted=fixture();
  assert.ok(decode(await restarted.context.getRadioCandidates('seed',first.nextCursor)).items.length>0);
  f.advance(31*60*1000);
  const fresh=decode(await f.context.getRadioCandidates('seed',first.nextCursor));
  assert.notEqual(fresh.nextCursor,first.nextCursor);
});

test('cache stays bounded to four seeds and forty external candidates each', async () => {
  const f=fixture();
  const first=decode(await f.context.getRadioCandidates('seed',null));
  for (let i=0;i<4;i++) await f.context.getRadioCandidates('another'+i,null);
  const before=f.requests.length;
  await f.context.getRadioCandidates('seed',first.nextCursor);
  assert.equal(f.requests.length,before+1); // evicted seed starts at suggestions
});
