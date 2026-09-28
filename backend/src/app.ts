import express from "express";
import { sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { errorHandler } from "./middleware/errors.js";
import { areasRouter } from "./modules/areas/areas.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { requestsRouter } from "./modules/requests/requests.routes.js";

export const app = express();

app.use(express.json());

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

app.use(errorHandler); // must stay last
