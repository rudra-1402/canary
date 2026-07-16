// Base class for errors that map to a specific HTTP status. The error
// middleware reads .statusCode and .name off these.
export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends AppError {
  constructor(resource, id) {
    super(`${resource} ${id} not found`, 404);
  }
}
