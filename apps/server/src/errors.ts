/** An error that maps to an HTTP response with the standard `{ error: { code, message } }` shape. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const payloadTooLarge = (message: string) => new AppError(413, 'payload_too_large', message);
export const unsupportedMedia = (message: string) => new AppError(415, 'unsupported_media_type', message);
export const unavailable = (code: string, message: string) => new AppError(503, code, message);
