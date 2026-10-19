import type { CropOverride } from './crop.js';
import type { Device, TargetSpec } from './devices.js';
import type { NormPoint, NormRect } from './geometry.js';
import type { Subject } from './subject.js';

// Wire types shared by the server routes and the web client.
// The server validates every request against matching TypeBox schemas.

export interface AppConfigResponse {
  version: string;
  outputVolumeAvailable: boolean;
  namingEnabled: boolean;
  limits: {
    maxUploadMb: number;
    maxInputMegapixels: number;
  };
}

export interface DevicesResponse {
  devices: Device[];
}

export interface SourceResponse {
  id: string;
  width: number;
  height: number;
  /** Downscaled preview image, served by the API. */
  proxyUrl: string;
  proxyWidth: number;
  proxyHeight: number;
  /** Default base name derived from the filename / URL. */
  baseName: string;
}

export type SubjectResponse = Subject;

export interface UrlSourceRequest {
  url: string;
}

/** A target plus its optional manual crop adjustment. */
export type TargetRequest = TargetSpec & { override?: CropOverride };

/** Global subject override (manual box). */
export interface SubjectOverride {
  box: NormRect;
  focal: NormPoint;
}

export interface RenderRequest {
  targets: TargetRequest[];
  name: string;
  subject?: SubjectOverride;
}

export interface SaveResponse {
  /** Paths written, relative to the output volume. */
  files: string[];
}

export interface NameSuggestionResponse {
  name: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
