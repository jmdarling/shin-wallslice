import { execFileSync, spawnSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aliases, compareVersions, versionFromTag } from './release-policy.mjs';
const image = process.env.IMAGE;
const version = versionFromTag(`v${process.env.RELEASE_VERSION}`);
const revision = process.env.RELEASE_REVISION;
const recovery = process.env.RECOVERY_DIGEST;
if (
  image !== 'ghcr.io/jmdarling/shin-wallslice' ||
  !/^[a-f0-9]{40}$/.test(revision)
)
  throw Error('Invalid release identity');
if (recovery && !/^sha256:[a-f0-9]{64}$/.test(recovery))
  throw Error('Recovery requires an exact sha256 digest');
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', timeout: 120000 }).trim();
function inspect(ref) {
  const r = spawnSync(
    'docker',
    ['buildx', 'imagetools', 'inspect', ref, '--format', '{{json .Manifest}}'],
    { encoding: 'utf8', timeout: 60000 },
  );
  if (r.status !== 0) {
    // Never interpret authentication/network/server failure as tag absence.
    if (
      /not found|manifest unknown/i.test(r.stderr) &&
      !/unauthorized|denied|timeout/i.test(r.stderr)
    )
      return undefined;
    throw Error(`Cannot inspect ${ref}: ${r.stderr}`);
  }
  return JSON.parse(r.stdout);
}
function checkExact() {
  const existing = inspect(`${image}:${version}`);
  if (existing && !recovery)
    throw Error(
      `Exact ${version} already exists (${existing.digest}); use explicit digest recovery, never overwrite`,
    );
  if (recovery && existing?.digest !== recovery)
    throw Error('Recovery digest does not equal the existing exact release');
  return existing;
}
checkExact();
if (process.argv[2] === 'publish') {
  const annotations = [
    '--annotation',
    `index:org.opencontainers.image.version=${version}`,
    '--annotation',
    `index:org.opencontainers.image.revision=${revision}`,
  ];
  if (!recovery) {
    const candidates = ['amd64', 'arm64'].map((arch) => {
      const digest = readFileSync(`evidence/digest-${arch}.txt`, 'utf8').trim();
      if (!/^sha256:[a-f0-9]{64}$/.test(digest))
        throw Error('Invalid candidate digest');
      return `${image}@${digest}`;
    });
    docker(
      'buildx',
      'imagetools',
      'create',
      ...annotations,
      '--tag',
      `${image}:${version}`,
      ...candidates,
    );
  }
  const exact = inspect(`${image}:${version}`);
  const raw = JSON.parse(
    docker(
      'buildx',
      'imagetools',
      'inspect',
      `${image}@${exact.digest}`,
      '--raw',
    ),
  );
  for (const arch of ['amd64', 'arm64']) {
    if (
      !raw.manifests?.some(
        (m) => m.platform?.os === 'linux' && m.platform.architecture === arch,
      )
    )
      throw Error(`Missing linux/${arch}`);
  }
  writeFileSync(
    'evidence/released-manifest.json',
    JSON.stringify(
      { image, version, revision, digest: exact.digest, manifest: raw },
      null,
      2,
    ) + '\n',
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Released artifact: \`${image}@${exact.digest}\`\n\n`,
    );
  const anonymous = mkdtempSync(join(tmpdir(), 'wallslice-anonymous-'));
  try {
    // An empty Docker config proves that package visibility permits anonymous pulls.
    execFileSync('docker', ['pull', `${image}@${exact.digest}`], {
      env: { ...process.env, DOCKER_CONFIG: anonymous },
      stdio: 'inherit',
      timeout: 120000,
    });
    execFileSync(
      process.execPath,
      ['scripts/docker-smoke.mjs', `${image}@${exact.digest}`],
      {
        env: { ...process.env, DOCKER_CONFIG: anonymous },
        stdio: 'inherit',
        timeout: 1200000,
      },
    );
  } finally {
    rmSync(anonymous, { recursive: true, force: true });
  }
  for (const alias of aliases(version)) {
    const current = inspect(`${image}:${alias}`);
    if (current) {
      const previous = JSON.parse(
        docker(
          'buildx',
          'imagetools',
          'inspect',
          `${image}@${current.digest}`,
          '--raw',
        ),
      ).annotations?.['org.opencontainers.image.version'];
      if (!previous)
        throw Error(
          `Alias ${alias} lacks version evidence; inspect manually before recovery`,
        );
      if (compareVersions(version, previous) < 0) {
        console.log(`Preserving newer ${alias} (${previous})`);
        continue;
      }
    }
    docker(
      'buildx',
      'imagetools',
      'create',
      ...annotations,
      '--tag',
      `${image}:${alias}`,
      `${image}@${exact.digest}`,
    );
    if (inspect(`${image}:${alias}`).digest !== exact.digest)
      throw Error(`Alias ${alias} digest differs`);
  }
  console.log(
    `Published ${image}@${exact.digest}; exact tag protected and aliases verified.`,
  );
}
