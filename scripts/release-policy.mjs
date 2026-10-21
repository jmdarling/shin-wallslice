import { readFileSync } from 'node:fs';
export function versionFromTag(tag) {
  if (
    tag.trim() !== tag ||
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)
  )
    throw new Error(
      'Release tag must be stable semantic version vMAJOR.MINOR.PATCH',
    );
  return tag.slice(1);
}
export function compareVersions(a, b) {
  const left = versionFromTag(`v${a}`).split('.').map(Number);
  const right = versionFromTag(`v${b}`).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}
export function validatePackages(tag, root = new URL('../', import.meta.url)) {
  const version = versionFromTag(tag);
  for (const path of [
    'package.json',
    'packages/client/package.json',
    'packages/server/package.json',
  ]) {
    if (
      JSON.parse(readFileSync(new URL(path, root), 'utf8')).version !== version
    )
      throw new Error(`${path} version does not match release ${version}`);
  }
  return version;
}
export function aliases(version) {
  const [major, minor] = version.split('.');
  return [major, `${major}.${minor}`, 'latest'];
}
