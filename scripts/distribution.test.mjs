import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aliases,
  compareVersions,
  validatePackages,
  versionFromTag,
} from './release-policy.mjs';
import { authorizeIssue, issueBranch } from './issue-policy.mjs';
test('only stable canonical semantic versions can publish; package versions agree', () => {
  assert.equal(validatePackages('v1.0.0'), '1.0.0');
  for (const tag of [
    '1.0.0',
    'v01.0.0',
    'v1.0.0-rc.1',
    'v1.0',
    'v1.0.0+build',
    'v1.0.0\n',
  ])
    assert.throws(() => versionFromTag(tag));
  assert.throws(() => validatePackages('v1.0.1'), /package.json/);
  assert.deepEqual(aliases('1.2.3'), ['1', '1.2', 'latest']);
});
test('older reruns cannot roll aliases back; compare numerically', () => {
  assert.equal(compareVersions('1.9.0', '1.10.0'), -1);
  assert.equal(compareVersions('2.0.0', '1.10.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
});
const owner = { login: 'jmdarling', id: 2251119, type: 'User' };
const outside = { login: 'outside', id: 123, type: 'User' };
const base = {
  eventName: 'issues',
  action: 'opened',
  sender: owner,
  author: owner,
  permission: 'admin',
  state: 'open',
  isPullRequest: false,
};
test('trusted owner-opened issue authorizes exactly the opening event', () => {
  assert.equal(authorizeIssue(base), true);
  for (const extra of [
    { sender: outside },
    { author: outside },
    { sender: { ...owner, id: 42 } },
    { sender: { ...owner, type: 'Bot' } },
    { action: 'edited' },
    { state: 'closed' },
    { isPullRequest: true },
  ])
    assert.equal(authorizeIssue({ ...base, ...extra }), false);
});
test('existing and outside issues require trusted maintainer dispatch', () => {
  assert.equal(
    authorizeIssue({
      ...base,
      eventName: 'workflow_dispatch',
      author: outside,
    }),
    true,
  );
  for (const permission of ['read', 'triage', 'none'])
    assert.equal(
      authorizeIssue({ ...base, eventName: 'workflow_dispatch', permission }),
      false,
    );
  assert.equal(authorizeIssue({ ...base, eventName: 'issue_comment' }), false);
  assert.equal(issueBranch(42), 'codex/issue-42');
  for (const number of [-1, 0, 1.1, NaN, '$(echo secret)'])
    assert.throws(() => issueBranch(number));
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

test('issue inputs do not break formatting or enter the collected patch', async () => {
  const {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    appendFileSync,
    rmSync,
  } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync, spawnSync } = await import('node:child_process');
  const workflow = readFileSync(
    new URL('../.github/workflows/issue-agent.yml', import.meta.url),
    'utf8',
  );
  const match = workflow.match(
    /name: Collect changes without executing proposed code\n {8}run: \|\n((?: {10}.*\n)+)/,
  );
  assert.ok(match, 'The production collector command must be exercised');
  const script = match[1]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'wallslice-collector-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  try {
    git('init', '--quiet');
    writeFileSync(join(dir, 'tracked.md'), 'before\n');
    git('add', 'tracked.md');
    git(
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    );
    mkdirSync(join(dir, '.issue-task'));
    appendFileSync(join(dir, '.git/info/exclude'), '\n.issue-task/\n');
    writeFileSync(join(dir, '.issue-task/issue.json'), 'private-task-sentinel');
    writeFileSync(join(dir, 'tracked.md'), 'after\n');
    const formatting = spawnSync(
      process.execPath,
      [
        new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url)
          .pathname,
        '--check',
        '.',
        '--ignore-path',
        new URL('../.prettierignore', import.meta.url).pathname,
      ],
      { cwd: dir, encoding: 'utf8' },
    );
    assert.equal(formatting.status, 0, formatting.stdout + formatting.stderr);
    const result = spawnSync('sh', ['-e', '-c', script], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git('diff', '--cached', '--name-only'), 'tracked.md');
    const patch = readFileSync(join(dir, '.issue-task/change.patch'), 'utf8');
    assert.match(patch, /\+after/);
    assert.doesNotMatch(patch, /private-task-sentinel/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
