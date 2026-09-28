import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

// Last middleware: turns anything a route throws into a clean JSON answer.
// Express 5 passes errors from async routes here on its own.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Invalid input",
      issues: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
    return;
  }
  // HttpError from our services, or broken JSON / a too-large body from express.json()
  if (err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
};
