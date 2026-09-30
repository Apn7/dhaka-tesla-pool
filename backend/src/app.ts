import express from "express";
import { sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { errorHandler } from "./middleware/errors.js";
import { areasRouter } from "./modules/areas/areas.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { driverRouter } from "./modules/driver/driver.routes.js";
import { requestsRouter } from "./modules/requests/requests.routes.js";

export const app = express();

app.disable("x-powered-by"); // don't advertise the framework

// One line per request: method, path, status, time taken
app.use((req, res, next) => {
  const started = performance.now();
  res.on("finish", () =>
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Math.round(performance.now() - started)}ms`),
  );
  next();
});

app.use(express.json());

// No database here on purpose: the keep-warm ping hits this, so Neon can still sleep
app.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ok", db: "up" });
  } catch (err) {
    console.error("Health check: database unreachable", err);
    res.status(503).json({ status: "error", db: "down" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/areas", areasRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/driver", driverRouter);

app.use(errorHandler); // must stay last
