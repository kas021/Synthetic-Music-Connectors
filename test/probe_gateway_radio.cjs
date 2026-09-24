// Explicit operator-only metadata probe. Never part of CI, never resolves audio.
// node test/probe_gateway_radio.cjs "One Dance" "Drake"
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const title = process.argv[2];
const artist = process.argv[3];
if (!title || !artist) throw Error('Pass exact title and primary artist');
let requests = 0;
const hostCounts = {};
const ctx = vm.createContext({
  __synthetiqBoundedFetchVersion: 1,
  fetch: async (url, options = {}) => {
    const host = new URL(url).host;
    requests++;
    hostCounts[host] = (hostCounts[host] || 0) + 1;
    return fetch(url, {...options, signal:AbortSignal.timeout(options.timeoutMs || 5000)});
  }
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../modules/synthetiq_music_gateway/index.js'),'utf8'),ctx);
const canonical = s => String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const primary = s => String(s||'').split(/,|&|\s+feat|\s+ft\./i)[0];
const decode = r => { if(!r.ok) throw Error('Source returned failure'); return JSON.parse(r.data); };
(async()=>{
  const rows=decode(await ctx.searchResults(title+' '+artist,0));
  const seed=rows.find(t=>t.type==='track' && canonical(t.title)===canonical(title) && canonical(primary(t.artist))===canonical(artist));
  if(!seed) { console.log(JSON.stringify({title,artist,status:'exact_seed_unavailable',requests})); return; }
  let cursor=null;
  const candidates=[];
  const timings=[];
  for(let i=0;i<48;i++) {
    const start=Date.now();
    const page=decode(await ctx.getRadioCandidates(seed.id,cursor));
    timings.push(Date.now()-start);
    candidates.push(...page.items);
    cursor=page.nextCursor;
    if(!cursor) break;
  }
  console.log(JSON.stringify({title,artist,seedId:seed.id,requests,hostCounts,pages:timings.length,
    maxPageMs:Math.max(...timings),count:candidates.length,
    uniqueRecordings:new Set(candidates.map(c=>canonical(c.track.title)+'|'+canonical(primary(c.track.artist)))).size,
    listenBrainz:candidates.filter(c=>c.recommendationProvider==='listenbrainz').map(c=>({title:c.track.title,artist:c.track.artist})),
    native:candidates.filter(c=>c.recommendationProvider==='jiosaavn').length,
    evidence:'metadata only; no audio playback tested'
  },null,2));
})().catch(()=>{console.error(JSON.stringify({title,artist,status:'probe_failed',requests,hostCounts}));process.exitCode=1;});
