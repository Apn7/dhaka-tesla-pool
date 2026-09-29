import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import * as driver from "./driver.service.js";

// Everything here acts on the caller's own Tesla and active ride, found through their
// login, so there is no ride id in any URL for someone to swap
export const driverRouter = Router();
driverRouter.use(requireAuth("DRIVER"));

driverRouter.get("/me", async (req, res) => {
  res.json(await driver.me(req.user!.id));
});

driverRouter.post("/online", async (req, res) => {
  const { online } = z.object({ online: z.boolean() }).parse(req.body);
  res.json({ vehicle: await driver.setOnline(req.user!.id, online) });
});

driverRouter.get("/requests", async (req, res) => {
  res.json({ requests: await driver.openRequests(req.user!.id) });
});

driverRouter.post("/requests/:id/accept", async (req, res) => {
  res.json(await driver.accept(req.user!.id, z.uuid().parse(req.params.id)));
});
