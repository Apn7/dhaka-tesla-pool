import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import * as requests from "./requests.service.js";

// coerce: query strings arrive as text ("2")
const trip = z
  .object({
    pickupAreaId: z.uuid(),
    dropoffAreaId: z.uuid(),
    seats: z.coerce.number().int().min(1).max(3),
  })
  .refine((t) => t.pickupAreaId !== t.dropoffAreaId, {
    message: "Pick a drop-off different from the pickup",
    path: ["dropoffAreaId"],
  });

export const requestsRouter = Router();
requestsRouter.use(requireAuth("PASSENGER"));

requestsRouter.get("/quote", async (req, res) => {
  const { pickupAreaId, dropoffAreaId, seats } = trip.parse(req.query);
  const result = await requests.quote(pickupAreaId, dropoffAreaId, seats);
  if (!result) {
    res.status(400).json({ error: "Unknown area" });
    return;
  }
  res.json(result);
});
