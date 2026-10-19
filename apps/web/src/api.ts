import type {
  ApiErrorResponse,
  AppConfigResponse,
  DevicesResponse,
  NameSuggestionResponse,
  RenderRequest,
  SaveResponse,
  SourceResponse,
  SubjectResponse,
} from '@shin-wallslice/core';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function check(response: Response): Promise<Response> {
  if (response.ok) return response;
  let code = 'http_error';
  let message = `Request failed (HTTP ${response.status}).`;
  try {
    const body = (await response.json()) as ApiErrorResponse;
    code = body.error.code;
    message = body.error.message;
  } catch {
    // Non-JSON error body; keep the generic message.
  }
  throw new ApiError(response.status, code, message);
}

async function getJson<T>(path: string): Promise<T> {
  return (await (await check(await fetch(path))).json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await (await check(response)).json()) as T;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

function fileNameFrom(response: Response, fallback: string): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  return /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallback;
}

export const api = {
  config: () => getJson<AppConfigResponse>('/api/config'),
  devices: () => getJson<DevicesResponse>('/api/devices'),

  async uploadFile(file: Blob, fileName: string): Promise<SourceResponse> {
    const form = new FormData();
    form.append('file', file, fileName);
    const response = await fetch('/api/sources', { method: 'POST', body: form });
    return (await (await check(response)).json()) as SourceResponse;
  },

  uploadUrl: (url: string) => postJson<SourceResponse>('/api/sources/url', { url }),
  subject: (id: string) => getJson<SubjectResponse>(`/api/sources/${id}/subject`),
  suggestName: (id: string) =>
    postJson<NameSuggestionResponse>(`/api/sources/${id}/name-suggestion`, {}),
  save: (id: string, request: RenderRequest) =>
    postJson<SaveResponse>(`/api/sources/${id}/save`, request),

  /** Render one target (PNG) or several (ZIP). */
  async render(id: string, request: RenderRequest): Promise<DownloadedFile> {
    const response = await check(
      await fetch(`/api/sources/${id}/render`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      }),
    );
    const fallback = request.targets.length === 1 ? 'wallpaper.png' : 'wallpapers.zip';
    return { blob: await response.blob(), fileName: fileNameFrom(response, fallback) };
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return 'Could not reach the server.';
  return error instanceof Error ? error.message : String(error);
}
