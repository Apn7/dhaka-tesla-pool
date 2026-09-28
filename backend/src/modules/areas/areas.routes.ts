import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getMap } from "./areas.service.js";

export const areasRouter = Router();

areasRouter.get("/", requireAuth(), async (_req, res) => {
  res.json({ areas: (await getMap()).areas });
});
