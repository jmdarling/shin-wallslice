export interface Device {
  id: string;
  name: string;
  width: number;
  height: number;
}
export type Anchor =
  'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right';
export interface Preferences {
  devices: string[];
  method: 'smart' | 'anchor';
  anchor: Anchor;
  oled: boolean;
  threshold: number;
  organizeIntoDeviceFolders: boolean;
}
export interface Crop {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface Job {
  id: string;
  width: number;
  height: number;
  smart: Record<string, Crop>;
}
export interface RenderSettings {
  crops: Record<string, Crop>;
  oled: boolean;
  threshold: number;
}
export interface Manifest {
  revision: string;
  source: string;
  outputs: Record<string, string>;
}
