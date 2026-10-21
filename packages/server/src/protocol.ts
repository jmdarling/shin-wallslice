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
  method: 'smart' | 'ai' | 'entropy' | 'anchor';
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
  naming?: NamingStatus;
  detection?: DetectionStatus;
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
export interface SaveResult {
  state: 'saved' | 'conflicts' | 'failed';
  destination: string;
  saved: string[];
  conflicts: string[];
  confirmation?: string;
  failed: { path: string; message: string }[];
}

export type NamingStatus =
  | { state: 'disabled' | 'pending' }
  | { state: 'succeeded'; name: string }
  | { state: 'failed'; message: string };

export type DetectionStatus =
  | { state: 'disabled' | 'pending' | 'no-subject' }
  | { state: 'succeeded'; crops: Record<string, Crop> }
  | { state: 'failed'; message: string };
