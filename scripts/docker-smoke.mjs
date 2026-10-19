import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const image = process.argv[2] ?? 'shin-wallslice:local';
const engine = process.argv[3] ?? 'docker';
const directory = mkdtempSync(join(tmpdir(), 'wallslice-smoke-'));
// Docker's non-root user must be able to traverse and read the fixture.
chmodSync(directory, 0o755);
const docker = (...args) =>
  execFileSync(engine, args, { encoding: 'utf8', timeout: 60000 }).trim();
const logs = (id) => {
  const result = spawnSync(engine, ['logs', id], {
    encoding: 'utf8',
    timeout: 10000,
  });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
};
const containers = new Set();
const pause = () => new Promise((resolve) => setTimeout(resolve, 300));

async function check(configPath, port) {
  const mount = configPath
    ? [
        '--mount',
        `type=bind,src=${configPath},dst=/config/config.json,readonly`,
      ]
    : [];
  const id = docker('run', '-d', '-p', `127.0.0.1::${port}`, ...mount, image);
  containers.add(id);
  const binding = docker('port', id, `${port}/tcp`).split('\n')[0];
  const base = `http://${binding}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).status === 'ok') {
        ready = true;
        break;
      }
    } catch {
      /* wait for startup */
    }
    await pause();
  }
  if (!ready) throw new Error(`Container did not become healthy: ${logs(id)}`);
  const html = await fetch(base).then((response) => {
    if (!response.ok) throw new Error('HTML failed');
    return response.text();
  });
  if (!html.includes('<shin-app>')) throw new Error('Placeholder is missing');
  const assets = [
    ...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css))"/g),
  ].map((match) => match[1]);
  if (assets.length < 2) throw new Error('Expected built JavaScript and CSS');
  for (const asset of assets) {
    const response = await fetch(new URL(asset, base));
    if (!response.ok || !(await response.text()).length)
      throw new Error(`Asset failed: ${asset}`);
  }
  if (docker('exec', id, 'id', '-u') === '0')
    throw new Error('Application runs as root');
  docker('rm', '-f', id);
  containers.delete(id);
}

try {
  await check(undefined, 3000);
  const replacement = join(directory, 'config.json');
  writeFileSync(
    replacement,
    JSON.stringify({ host: '0.0.0.0', port: 3456, logLevel: 'warn' }),
    { mode: 0o644 },
  );
  await check(replacement, 3456);
  for (const [name, contents] of [
    ['malformed', '{broken'],
    ['invalid', JSON.stringify({ host: '0.0.0.0', port: 0, logLevel: 'info' })],
  ]) {
    const path = join(directory, `${name}.json`);
    writeFileSync(path, contents, { mode: 0o644 });
    const id = docker(
      'create',
      '--mount',
      `type=bind,src=${path},dst=/config/config.json,readonly`,
      image,
    );
    containers.add(id);
    docker('start', id);
    const status = docker('wait', id);
    if (status === '0' || !logs(id).includes('Configuration error'))
      throw new Error(`${name} config did not fail clearly`);
    docker('rm', id);
    containers.delete(id);
  }
  console.log(
    'Container smoke check passed: HTML, assets, health, non-root user, replacement port, and invalid configuration.',
  );
} finally {
  for (const id of containers) docker('rm', '-f', id);
  rmSync(directory, { recursive: true, force: true });
}
