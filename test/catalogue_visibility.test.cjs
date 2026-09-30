const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'catalogue.json'), 'utf8'));

test('only the verified Gateway is offered for normal installation', () => {
  assert.deepEqual(catalogue.modules.map(entry => entry.moduleFamilyId), [
    'synthetiq_music_gateway',
  ]);
  assert.equal(catalogue.modules[0].version, '1.4.3');
  assert.deepEqual(new Set(catalogue.disabledModules.map(entry => entry.moduleFamilyId)), new Set([
    'freefy_music',
    'synthetiq_global_resolver',
    'synthetiq_ytmusic_direct',
  ]));
  assert.ok(catalogue.disabledModules.every(entry => entry.availability === 'disabled'));
});

test('every retained package still matches its published hash', () => {
  const entries = [...catalogue.modules, ...catalogue.disabledModules];
  assert.equal(new Set(entries.map(entry => entry.moduleFamilyId)).size, entries.length);
  for (const entry of entries) {
    const packagePath = path.resolve(root, entry.file);
    assert.ok(packagePath.startsWith(path.join(root, 'packages') + path.sep));
    const actualHash = createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex');
    assert.equal(actualHash, entry.sha256, `${entry.moduleFamilyId} package changed`);
  }
});
