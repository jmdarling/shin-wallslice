import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const image = process.argv[2] ?? 'shin-wallslice:local';
const engine = process.argv[3] ?? 'docker';
const configurationOnly = process.argv.includes('--configuration-only');
const quick = process.argv.includes('--quick');
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

async function check(configPath, port, environment = []) {
  const mount = configPath
    ? [
        '--mount',
        `type=bind,src=${configPath},dst=/config/config.json,readonly`,
      ]
    : [];
  const id = docker(
    'run',
    '-d',
    '--memory',
    '4g',
    '-p',
    `127.0.0.1::${port}`,
    ...mount,
    ...environment.flatMap((entry) => ['--env', entry]),
    image,
  );
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
  if (!html.includes('<shin-app>'))
    throw new Error('Application element is missing');
  const assets = [
    ...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css))"/g),
  ].map((match) => match[1]);
  if (assets.length < 2) throw new Error('Expected built JavaScript and CSS');
  for (const asset of assets) {
    const response = await fetch(new URL(asset, base));
    const contents = await response.text();
    if (!response.ok || !contents.length)
      throw new Error(`Asset failed: ${asset}`);
    if (contents.includes('smoke-private-sentinel'))
      throw new Error('Credential leaked into client assets');
  }
  docker(
    'exec',
    id,
    'sh',
    '-c',
    'test ! -e /usr/local/bin/npm && test ! -d /app/packages/server/src && test ! -e /app/config/local.json && test ! -d /app/specs',
  );
  if (docker('exec', id, 'id', '-u') === '0')
    throw new Error('Application runs as root');
  // Exercise the exact image health check with the same environment as the app.
  const health = JSON.parse(
    docker('inspect', '--format', '{{json .Config.Healthcheck.Test}}', id),
  );
  docker('exec', id, ...health.slice(1));
  if (environment.length) {
    const providerCheck = `
      import { createServer } from 'node:http';
      import { createRequire } from 'node:module';
      const sharp = createRequire(new URL('./packages/server/package.json', import.meta.url))('sharp');
      const secret = process.env.SHIN_WALLSLICE_AI_TOKEN;
      let authenticated = false;
      const provider = createServer((req, res) => {
        authenticated = req.headers.authorization === 'Bearer ' + secret && req.url === '/v1/chat/completions';
        req.resume();
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'Moonlit Mountain Lake'}}]}));
      });
      await new Promise(resolve => provider.listen(4567, '127.0.0.1', resolve));
      try {
        const image = await sharp({create:{width:1800,height:600,channels:3,background:'#123456'}}).png().toBuffer();
        const base = 'http://127.0.0.1:' + process.env.SHIN_WALLSLICE_PORT;
        const upload = await fetch(base + '/api/jobs', {method:'POST',headers:{'content-type':'application/octet-stream'},body:image});
        if (!upload.ok) throw new Error('Upload failed');
        const job = await upload.json();
        let succeeded = false;
        for (let i = 0; i < 100; i++) {
          const result = await fetch(base + '/api/jobs/' + job.id + '/naming').then(r => r.json());
          if (result.state === 'succeeded') { succeeded = true; break; }
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!authenticated || !succeeded) throw new Error('Environment authentication failed');
        await fetch(base + '/api/jobs/' + job.id, {method:'DELETE'});
      } finally { await new Promise(resolve => provider.close(resolve)); }
    `;
    docker('exec', id, 'node', '--input-type=module', '-e', providerCheck);
    if (logs(id).includes('smoke-private-sentinel'))
      throw new Error('Credential leaked into logs');
  }
  if (!configurationOnly) {
    const script = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./container-workflow.mjs', import.meta.url), 'utf8'),
    );
    const result = spawnSync(
      engine,
      [
        'exec',
        ...(quick ? ['--env', 'WALLSLICE_SMOKE_QUICK=1'] : []),
        id,
        'node',
        '--input-type=module',
        '-e',
        script.replaceAll('../packages/server', './packages/server'),
      ],
      { encoding: 'utf8', timeout: 600000 },
    );
    if (result.status !== 0)
      throw new Error(
        `Wallpaper workflow failed: ${result.stdout} ${result.stderr}`,
      );
    console.log(result.stdout);
  }
  docker('rm', '-f', id);
  containers.delete(id);
}

try {
  await check(undefined, 3000);
  const replacement = join(directory, 'config.json');
  writeFileSync(
    replacement,
    JSON.stringify({
      port: 3456,
      logLevel: 'warn',
    }),
    { mode: 0o644 },
  );
  await check(replacement, 3456);
  await check(undefined, 3457, [
    'SHIN_WALLSLICE_HOST=0.0.0.0',
    'SHIN_WALLSLICE_PORT=3457',
    'SHIN_WALLSLICE_AI_ENABLED=true',
    'SHIN_WALLSLICE_AI_BASE_URL=http://127.0.0.1:4567/v1',
    'SHIN_WALLSLICE_AI_MODEL=controlled-vision',
    'SHIN_WALLSLICE_AI_TOKEN=smoke-private-sentinel',
  ]);
  for (const [name, contents, environment = []] of [
    ['malformed', '{"ai":{"token":"smoke-private-sentinel"}, BROKEN'],
    ['invalid', JSON.stringify({ host: '0.0.0.0', port: 0, logLevel: 'info' })],
    [
      'environment',
      '{}',
      [
        'SHIN_WALLSLICE_AI_ENABLED=smoke-private-sentinel',
        'SHIN_WALLSLICE_AI_TOKEN=smoke-private-sentinel',
      ],
    ],
  ]) {
    const path = join(directory, `${name}.json`);
    writeFileSync(path, contents, { mode: 0o644 });
    const id = docker(
      'create',
      '--mount',
      `type=bind,src=${path},dst=/config/config.json,readonly`,
      ...environment.flatMap((entry) => ['--env', entry]),
      image,
    );
    containers.add(id);
    docker('start', id);
    // Podman remote `wait` can report the exit code and then hang under emulation.
    // Poll explicit state instead, with a bounded startup-failure deadline.
    let state = '';
    for (let attempt = 0; attempt < 100; attempt++) {
      state = docker(
        'inspect',
        '--format',
        '{{.State.Running}} {{.State.ExitCode}}',
        id,
      );
      if (state.startsWith('false ')) break;
      await pause();
    }
    if (
      !state.startsWith('false ') ||
      state === 'false 0' ||
      !logs(id).includes('Configuration error') ||
      logs(id).includes('smoke-private-sentinel')
    )
      throw new Error(`${name} config did not fail clearly`);
    docker('rm', id);
    containers.delete(id);
  }
  console.log(
    'Container smoke check passed: HTML, assets, health, non-root user, JSON overrides, environment-only AI authentication, overridden-port health, and invalid configuration.',
  );
} finally {
  for (const id of containers) docker('rm', '-f', id);
  rmSync(directory, { recursive: true, force: true });
}
