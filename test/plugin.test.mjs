import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('AC-4 provider manifests expose one self-contained shared scheduling skill', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const provider of ['claude', 'codex']) {
    const manifest = JSON.parse(await readFile(new URL(`../.${provider}-plugin/plugin.json`, import.meta.url), 'utf8'));
    const market = JSON.parse(await readFile(new URL(`../.${provider}-plugin/marketplace.json`, import.meta.url), 'utf8'));
    assert.equal(manifest.version, pkg.version);
    assert.equal(market.plugins[0].version, pkg.version);
    assert.equal(market.plugins[0].name, manifest.name);
    assert.equal(market.plugins[0].source, './');
    await access(new URL('../skills/schedule/SKILL.md', import.meta.url));
    await access(new URL('../docs/schedules.md', import.meta.url));
  }
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies.croner, '11.0.0');
});
