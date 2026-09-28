// Thrown by services for an expected "no" (unknown area, wrong state, not yours).
// The error handler answers with this status and message.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
