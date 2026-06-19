export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(message: string, status = 400, code = 'bad_request', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'Resource') => new AppError(`${what} not found`, 404, 'not_found');
export const forbidden = (msg = 'You do not have permission to do that') => new AppError(msg, 403, 'forbidden');
export const unauthorized = (msg = 'Authentication required') => new AppError(msg, 401, 'unauthorized');
export const conflict = (msg = 'Conflict') => new AppError(msg, 409, 'conflict');
export const validation = (msg: string, details?: unknown) => new AppError(msg, 422, 'validation_error', details);
