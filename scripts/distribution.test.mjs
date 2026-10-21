import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aliases,
  compareVersions,
  validatePackages,
  versionFromTag,
} from './release-policy.mjs';
test('only stable canonical semantic versions can publish; package versions agree', () => {
  assert.equal(validatePackages('v1.3.0'), '1.3.0');
  for (const tag of [
    '1.0.0',
    'v01.0.0',
    'v1.0.0-rc.1',
    'v1.0',
    'v1.0.0+build',
    'v1.0.0\n',
  ])
    assert.throws(() => versionFromTag(tag));
  assert.throws(() => validatePackages('v1.0.2'), /package.json/);
  assert.deepEqual(aliases('1.2.3'), ['1', '1.2', 'latest']);
});
test('older reruns cannot roll aliases back; compare numerically', () => {
  assert.equal(compareVersions('1.9.0', '1.10.0'), -1);
  assert.equal(compareVersions('2.0.0', '1.10.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
});
test('registry preflight protects immutable tags and fails closed on registry errors', async () => {
  const { mkdtempSync, writeFileSync, chmodSync, rmSync } =
    await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'wallslice-release-policy-'));
  const executable = join(dir, 'docker');
  writeFileSync(
    executable,
    `#!${process.execPath}\nif(process.env.FAKE_ERROR){process.stderr.write(process.env.FAKE_ERROR);process.exit(1)}console.log(JSON.stringify({digest:'sha256:'+'a'.repeat(64)}));\n`,
  );
  chmodSync(executable, 0o755);
  const env = {
    ...process.env,
    PATH: `${dir}:${process.env.PATH}`,
    IMAGE: 'ghcr.io/jmdarling/shin-wallslice',
    RELEASE_VERSION: '1.0.0',
    RELEASE_REVISION: 'b'.repeat(40),
    RECOVERY_DIGEST: '',
  };
  const script = new URL('./release-registry.mjs', import.meta.url).pathname;
  const invoke = (extra) =>
    spawnSync(process.execPath, [script, 'preflight'], {
      env: { ...env, ...extra },
      encoding: 'utf8',
    });
  try {
    assert.match(invoke({}).stderr, /already exists/);
    assert.equal(
      invoke({ RECOVERY_DIGEST: 'sha256:' + 'a'.repeat(64) }).status,
      0,
    );
    assert.match(
      invoke({ RECOVERY_DIGEST: 'sha256:' + 'c'.repeat(64) }).stderr,
      /does not equal/,
    );
    assert.equal(
      invoke({ FAKE_ERROR: 'manifest unknown: not found' }).status,
      0,
    );
    for (const error of [
      'unauthorized: not found',
      'network timeout',
      'connection refused',
    ])
      assert.notEqual(invoke({ FAKE_ERROR: error }).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
