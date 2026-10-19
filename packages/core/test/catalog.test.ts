import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CatalogValidationError, validateCatalog, type DeviceFile } from '../src/catalog.js';

const devicesDir = fileURLToPath(new URL('../../../devices/', import.meta.url));

async function loadSchema(): Promise<object> {
  return JSON.parse(await readFile(`${devicesDir}device.schema.json`, 'utf8')) as object;
}

async function loadRepoCatalog(): Promise<DeviceFile[]> {
  const names = (await readdir(devicesDir)).filter(
    (name) => name.endsWith('.json') && name !== 'device.schema.json',
  );
  return Promise.all(
    names.map(async (fileName) => ({
      fileName,
      data: JSON.parse(await readFile(`${devicesDir}${fileName}`, 'utf8')) as unknown,
    })),
  );
}

describe('repository device catalog', () => {
  it('is valid', async () => {
    const files = await loadRepoCatalog();
    expect(files.length).toBeGreaterThan(0);
    const devices = validateCatalog(await loadSchema(), files);
    expect(devices).toHaveLength(files.length);
  });

  it('cites a source for every device', async () => {
    const devices = validateCatalog(await loadSchema(), await loadRepoCatalog());
    const missing = devices.filter((device) => !device.source).map((device) => device.id);
    expect(missing).toEqual([]);
  });
});

describe('validateCatalog', () => {
  const valid = {
    id: 'acme-phone',
    name: 'Acme Phone',
    brand: 'Acme',
    category: 'phone',
    resolution: { width: 1000, height: 2000 },
  };

  it('rejects schema violations', async () => {
    const schema = await loadSchema();
    expect(() =>
      validateCatalog(schema, [
        { fileName: 'acme-phone.json', data: { ...valid, category: 'toaster' } },
      ]),
    ).toThrow(CatalogValidationError);
  });

  it('rejects mismatched file names and duplicate ids', async () => {
    const schema = await loadSchema();
    expect(() => validateCatalog(schema, [{ fileName: 'other.json', data: valid }])).toThrow(
      /must match id/,
    );
    expect(() =>
      validateCatalog(schema, [
        { fileName: 'acme-phone.json', data: valid },
        { fileName: 'acme-phone.json', data: valid },
      ]),
    ).toThrow(/duplicate id/);
  });

  it('rejects landscape phones', async () => {
    const schema = await loadSchema();
    expect(() =>
      validateCatalog(schema, [
        {
          fileName: 'acme-phone.json',
          data: { ...valid, resolution: { width: 2000, height: 1000 } },
        },
      ]),
    ).toThrow(/portrait/);
  });
});
