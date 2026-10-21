import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const image = process.argv[2] ?? 'shin-wallslice:local';
const engine = process.argv[3] ?? 'docker';
const run = (...args) =>
  execFileSync(engine, args, { encoding: 'utf8', timeout: 60000 }).trim();
// Podman VM SELinux needs labeling on the dedicated test mount; the bootstrap
// helper disables labels only to create/remove that directory under /var/tmp.
const bootstrapOptions = engine.endsWith('podman')
  ? ['--security-opt', 'label=disable']
  : [];
const bindLabel = engine.endsWith('podman') ? ',relabel=private' : '';
const key = `wallslice-persistence-${randomUUID()}`;
const ids = new Set();
const volume = run('volume', 'create', key);
async function start(mount, root = false) {
  const id = run(
    'run',
    '-d',
    '--memory=4g',
    ...(root ? ['--user=0:0'] : []),
    '--mount',
    mount,
    image,
  );
  ids.add(id);
  const poll = `for(let n=0;n<100;n++){try {const r=await fetch('http://127.0.0.1:3000/api/health');if(r.ok)process.exit(0)}catch{}await new Promise(r=>setTimeout(r,100))}process.exit(1)`;
  try {
    run('exec', id, 'node', '--input-type=module', '-e', poll);
  } catch (error) {
    throw new Error(`Startup failed: ${run('logs', id)}`, { cause: error });
  }
  // Check the application process, including when the initializer started as root.
  const status = run('exec', id, 'cat', '/proc/1/status');
  assert.match(status, /Uid:\s+1000\s+1000\s+1000\s+1000/);
  assert.equal(
    run(
      'exec',
      id,
      'find',
      '/usr',
      '-xdev',
      '-type',
      'f',
      '-perm',
      '/6000',
      '-print',
    ),
    '',
  );
  return id;
}
function stop(id) {
  run('rm', '-f', id);
  ids.delete(id);
}
const get = `const c=await fetch('http://127.0.0.1:3000/api/catalog').then(r=>r.json());`;
const modify = `${get} const p={...c.preferences,oled:true,threshold:37};const r=await fetch('http://127.0.0.1:3000/api/preferences',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(p)});if(!r.ok)throw Error(await r.text());`;
const verify = `${get}if(!c.preferences.oled||c.preferences.threshold!==37)throw Error('Preferences lost across replacement');`;
try {
  let id = await start(`type=volume,src=${volume},dst=/data`);
  run('exec', id, 'node', '--input-type=module', '-e', modify);
  stop(id);
  id = await start(`type=volume,src=${volume},dst=/data`);
  run('exec', id, 'node', '--input-type=module', '-e', verify);
  stop(id);
  // Create a fresh root-owned 0755 directory ON THE ENGINE HOST. This also works
  // with remote engines, where a client-side temporary bind path would be wrong.
  const hostPath = `/var/tmp/${key}`;
  run(
    'run',
    '--rm',
    '--user=0:0',
    ...bootstrapOptions,
    '--mount',
    'type=bind,src=/var/tmp,dst=/host-tmp',
    '--entrypoint',
    'sh',
    image,
    '-c',
    'mkdir -m 755 "$1"; mkdir -m 700 "$1/untouched"; chown 1234:1234 "$1/untouched"',
    'sh',
    `/host-tmp/${key}`,
  );
  try {
    id = await start(`type=bind,src=${hostPath},dst=/data${bindLabel}`, true);
    assert.equal(
      run('exec', id, 'stat', '-c', '%u:%g %a', '/data'),
      '1000:1000 750',
    );
    assert.equal(
      run('exec', id, 'stat', '-c', '%u:%g %a', '/data/untouched'),
      '1234:1234 700',
    );
    run('exec', id, 'node', '--input-type=module', '-e', modify);
    stop(id);
    // Existing UID 1000 preferences survive the initializer on replacement.
    id = await start(`type=bind,src=${hostPath},dst=/data${bindLabel}`, true);
    run('exec', id, 'node', '--input-type=module', '-e', verify);
    stop(id);
  } finally {
    for (const id of ids) stop(id);
    run(
      'run',
      '--rm',
      '--user=0:0',
      ...bootstrapOptions,
      '--mount',
      'type=bind,src=/var/tmp,dst=/host-tmp',
      '--entrypoint',
      'sh',
      image,
      '-c',
      'rm -f "$1/preferences.json"; rmdir "$1/untouched"; rmdir "$1"',
      'sh',
      `/host-tmp/${key}`,
    );
  }
  console.log(
    'Named volume and root-owned 0755 bind mount: non-root PID 1, initialization, replacement, and persistent preferences passed.',
  );
} finally {
  for (const id of ids) stop(id);
  run('volume', 'rm', volume);
}
