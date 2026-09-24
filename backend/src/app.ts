import express from "express";
import { sql } from "drizzle-orm";
import { db } from "./db/index.js";

export const app = express();

app.get("/health", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ok", db: "up" });
  } catch (err) {
    console.error("Health check: database unreachable", err);
    res.status(503).json({ status: "error", db: "down" });
  }
});
