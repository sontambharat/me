/**
 * Domain errors carry an HTTP status so the transport layer can translate them
 * without knowing anything about the domain.
 */
export class AppError extends Error {
  constructor(message, status = 400, code = 'bad_request') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(what = 'Resource') {
    super(`${what} not found`, 404, 'not_found');
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 422, 'validation_error');
    this.details = details;
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'unauthorized');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do that') {
    super(message, 403, 'forbidden');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409, 'conflict');
  }
}
