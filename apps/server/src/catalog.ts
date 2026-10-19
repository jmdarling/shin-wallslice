import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Device } from '@shin-wallslice/core';
import { validateCatalog, type DeviceFile } from '@shin-wallslice/core/catalog';

export const SCHEMA_FILE = 'device.schema.json';

export interface Catalog {
  devices: Device[];
  byId: ReadonlyMap<string, Device>;
}

/** Load and validate the device catalog. Throws (refusing to start) on any invalid file. */
export async function loadCatalog(devicesDir: string): Promise<Catalog> {
  const schema = JSON.parse(await readFile(join(devicesDir, SCHEMA_FILE), 'utf8')) as object;
  const names = (await readdir(devicesDir)).filter(
    (name) => name.endsWith('.json') && name !== SCHEMA_FILE,
  );
  const files: DeviceFile[] = await Promise.all(
    names.map(async (fileName) => {
      const raw = await readFile(join(devicesDir, fileName), 'utf8');
      try {
        return { fileName, data: JSON.parse(raw) as unknown };
      } catch (error) {
        throw new Error(`${fileName}: invalid JSON (${(error as Error).message})`, {
          cause: error,
        });
      }
    }),
  );
  const devices = validateCatalog(schema, files);
  return { devices, byId: new Map(devices.map((device) => [device.id, device])) };
}
