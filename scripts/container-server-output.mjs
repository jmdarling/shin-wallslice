// Executed by container-persistence.mjs inside each architecture's built image.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { readFile, writeFile, readdir } from 'node:fs/promises';
const require = createRequire(
  new URL('../packages/server/package.json', import.meta.url),
);
const sharp = require('sharp');
const {
  ZipReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
} = require('@zip.js/zip.js');
const base = 'http://127.0.0.1:3000';
async function json(path, init) {
  const response = await fetch(base + path, init);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
const catalog = await json('/api/catalog');
assert.equal(catalog.serverSavingEnabled, true);
const source = await sharp({
  create: { width: 240, height: 160, channels: 3, background: '#101010' },
})
  .png()
  .toBuffer();
const job = await json('/api/jobs', {
  method: 'POST',
  headers: { 'content-type': 'application/octet-stream' },
  body: source,
});
const selected = catalog.devices.slice(0, 2);
const manifest = await json(`/api/jobs/${job.id}/render`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    crops: Object.fromEntries(selected.map((d) => [d.id, job.smart[d.id]])),
    oled: true,
    threshold: 16,
  }),
});
const destination = '/data/output';
const files = [];
const save = (folders, confirmation) =>
  json(`/api/jobs/${job.id}/save/${manifest.revision}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'persistent-test',
      organizeIntoDeviceFolders: folders,
      ...(confirmation ? { confirmation } : {}),
    }),
  });
for (const folders of [false, true]) {
  const result = await save(folders);
  assert.equal(result.state, 'saved');
  const response = await fetch(
    `${base}/api/jobs/${job.id}/zip/${manifest.revision}?name=persistent-test&organizeIntoDeviceFolders=${folders}`,
  );
  assert.equal(response.status, 200);
  const reader = new ZipReader(
    new Uint8ArrayReader(new Uint8Array(await response.arrayBuffer())),
  );
  const entries = await reader.getEntries();
  assert.deepEqual(
    entries.map((e) => e.filename),
    result.saved,
  );
  for (const entry of entries) {
    const path = `${destination}/${entry.filename}`;
    const contents = await readFile(path);
    assert.ok(
      contents.equals(Buffer.from(await entry.getData(new Uint8ArrayWriter()))),
    );
    files.push({ path, contents: contents.toString('base64') });
  }
  await reader.close();
  const review = await save(folders);
  assert.equal(review.state, 'conflicts');
  assert.equal(review.saved.length, 0);
  assert.deepEqual(review.conflicts, result.saved);
  // Cancel is no further request; confirmed contents remain identical.
  for (const file of files)
    assert.equal((await readFile(file.path)).toString('base64'), file.contents);
  assert.equal((await save(folders, review.confirmation)).state, 'saved');
}
await writeFile(`${destination}/unrelated.txt`, 'keep');
await json(`/api/jobs/${job.id}`, { method: 'DELETE' });
for (const file of files)
  assert.equal((await readFile(file.path)).toString('base64'), file.contents);
assert.ok((await readdir(destination)).includes('unrelated.txt'));
await writeFile('/data/output-verification.json', JSON.stringify(files));
console.log(
  `Server save: ${process.arch}, both layouts, ZIP bytes, cancel/replace, and job cleanup passed.`,
);
