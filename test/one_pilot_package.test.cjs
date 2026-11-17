const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

test('ONE pilot catalogue is isolated, exact-hash pinned and not recommended', () => {
  const pilot = JSON.parse(fs.readFileSync(path.join(root, 'one-pilot-catalogue.json')));
  assert.equal(pilot.schemaVersion, 1);
  assert.equal(pilot.modules.length, 1);
  const entry = pilot.modules[0];
  assert.equal(entry.moduleFamilyId, 'synthetiq_one_music');
  assert.equal(entry.moduleIdentityNumber, 3040);
  assert.equal(entry.releaseTrack, 'staging');
  assert.equal(entry.presentation.recommended, false);
  const zip = fs.readFileSync(path.join(root, entry.file));
  assert.equal(crypto.createHash('sha256').update(zip).digest('hex'), entry.sha256);
  assert.equal(entry.sha256, '95a4063d5b343333c371c5b9e1fe781a9d3c72939d7e7a8b0d4fbb215f60f2a0');
  const normal = JSON.parse(fs.readFileSync(path.join(root, 'catalogue.json')));
  assert.equal(normal.modules.some(e => e.moduleFamilyId === entry.moduleFamilyId), false);
});

test('ONE package requests native transport and cannot extract audio in JS', () => {
  const moduleRoot = path.join(root, 'modules/synthetiq_one_music');
  const manifest = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'module.json')));
  assert.equal(manifest.moduleFamilyId, 'synthetiq_one_music');
  assert.equal(manifest.moduleVersion, '0.1.0');
  assert.equal(manifest.config.capabilities.music_one_transport_v1, true);
  assert.equal(manifest.config.allowOfflineDownload, false);
  assert.equal(manifest.config.allowFileExport, false);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(moduleRoot, 'index.js'), 'utf8'), context, {timeout: 100});
  for (const handler of ['searchResults', 'extractDetails', 'extractTracks', 'extractAudioUrl']) {
    assert.throws(() => context[handler](), /one_native_transport_required/);
  }
});
