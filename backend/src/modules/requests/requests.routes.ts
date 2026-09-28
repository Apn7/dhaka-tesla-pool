import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import * as requests from "./requests.service.js";

// coerce: query strings arrive as text ("2"). Unknown fields (like a fare) are dropped.
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
  const t = trip.parse(req.query);
  res.json(await requests.quote(t.pickupAreaId, t.dropoffAreaId, t.seats));
});

requestsRouter.post("/", async (req, res) => {
  const t = trip.parse(req.body);
  res.status(201).json(await requests.book(req.user!.id, t.pickupAreaId, t.dropoffAreaId, t.seats));
});

requestsRouter.post("/:id/cancel", async (req, res) => {
  res.json(await requests.cancel(req.user!.id, z.uuid().parse(req.params.id)));
});

requestsRouter.get("/current", async (req, res) => {
  res.json({ request: await requests.current(req.user!.id) });
});

requestsRouter.get("/history", async (req, res) => {
  res.json({ requests: await requests.history(req.user!.id) });
});
