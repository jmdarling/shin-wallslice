import { Ajv, type ErrorObject } from 'ajv';
import type { Device } from './devices.js';

/** A device file before validation: its name on disk and parsed JSON content. */
export interface DeviceFile {
  fileName: string;
  data: unknown;
}

export class CatalogValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid device catalog:\n  - ${problems.join('\n  - ')}`);
    this.name = 'CatalogValidationError';
  }
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

/**
 * Validate every device file against the JSON Schema plus cross-file rules
 * (unique ids, id matches file name). Throws CatalogValidationError listing all problems.
 */
export function validateCatalog(schema: object, files: DeviceFile[]): Device[] {
  const ajv = new Ajv({ allErrors: true, strict: true });
  ajv.addFormat('uri', /^https?:\/\/\S+$/);
  // The `$schema` key in the device files points at the schema file for editor support.
  const validate = ajv.compile<Device & { $schema?: string }>({
    ...schema,
    $schema: undefined,
    $id: undefined,
  });

  const problems: string[] = [];
  const devices: Device[] = [];
  const seenIds = new Map<string, string>();

  for (const file of files) {
    if (!validate(file.data)) {
      problems.push(`${file.fileName}: ${formatAjvErrors(validate.errors)}`);
      continue;
    }
    const { $schema: _schema, ...device } = file.data;
    const expectedFileName = `${device.id}.json`;
    if (file.fileName !== expectedFileName) {
      problems.push(`${file.fileName}: file name must match id (expected ${expectedFileName})`);
    }
    const previous = seenIds.get(device.id);
    if (previous) {
      problems.push(`${file.fileName}: duplicate id "${device.id}" (also in ${previous})`);
    }
    seenIds.set(device.id, file.fileName);
    if (
      (device.category === 'phone' || device.category === 'tablet') &&
      device.resolution.width > device.resolution.height
    ) {
      problems.push(
        `${file.fileName}: phones and tablets must be listed portrait (width <= height)`,
      );
    }
    devices.push(device);
  }

  if (problems.length > 0) throw new CatalogValidationError(problems);
  return devices.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.brand.localeCompare(b.brand) ||
      (b.year ?? 0) - (a.year ?? 0) ||
      a.name.localeCompare(b.name),
  );
}
