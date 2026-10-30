// An error that carries an HTTP status code.
// Throw it anywhere in a route or service; the error handler turns it into a JSON response.

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
