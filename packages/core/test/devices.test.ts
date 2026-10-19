import { describe, expect, it } from 'vitest';
import {
  deviceOutputSize,
  deviceRotates,
  resolveTarget,
  type Device,
} from '../src/index.js';

const ipad: Device = {
  id: 'apple-ipad-pro-11-m5',
  name: 'iPad Pro 11-inch (M5)',
  brand: 'Apple',
  category: 'tablet',
  resolution: { width: 1668, height: 2420 },
};

const phone: Device = {
  id: 'apple-iphone-18-pro-max',
  name: 'iPhone 18 Pro Max',
  brand: 'Apple',
  category: 'phone',
  resolution: { width: 1320, height: 2868 },
};

describe('rotating devices', () => {
  it('defaults tablets to rotating and others to fixed', () => {
    expect(deviceRotates(ipad)).toBe(true);
    expect(deviceRotates(phone)).toBe(false);
    expect(deviceRotates({ ...phone, rotates: true })).toBe(true);
    expect(deviceRotates({ ...ipad, rotates: false })).toBe(false);
  });

  it('outputs a square of the longest side for rotating devices', () => {
    expect(deviceOutputSize(ipad)).toEqual({ width: 2420, height: 2420 });
    expect(deviceOutputSize(phone)).toEqual({ width: 1320, height: 2868 });
  });
});

describe('resolveTarget', () => {
  const devices = new Map([ipad, phone].map((d) => [d.id, d]));

  it('resolves catalog devices', () => {
    expect(resolveTarget({ kind: 'device', deviceId: ipad.id }, devices)).toMatchObject({
      key: ipad.id,
      rotates: true,
      outputSize: { width: 2420, height: 2420 },
    });
    expect(resolveTarget({ kind: 'device', deviceId: 'nope' }, devices)).toBeUndefined();
  });

  it('resolves custom sizes', () => {
    expect(resolveTarget({ kind: 'custom', width: 1000, height: 500 }, devices)).toEqual({
      key: 'custom-1000x500',
      label: 'Custom 1000×500',
      resolution: { width: 1000, height: 500 },
      rotates: false,
      outputSize: { width: 1000, height: 500 },
    });
    expect(
      resolveTarget({ kind: 'custom', width: 800, height: 1200, rotates: true, label: 'Kiosk' }, devices),
    ).toMatchObject({ key: 'custom-800x1200-square', label: 'Kiosk', outputSize: { width: 1200, height: 1200 } });
  });

  it('rejects invalid custom sizes', () => {
    expect(resolveTarget({ kind: 'custom', width: 10, height: 500 }, devices)).toBeUndefined();
    expect(resolveTarget({ kind: 'custom', width: 20000, height: 500 }, devices)).toBeUndefined();
    expect(resolveTarget({ kind: 'custom', width: 100.5, height: 500 }, devices)).toBeUndefined();
  });
});
