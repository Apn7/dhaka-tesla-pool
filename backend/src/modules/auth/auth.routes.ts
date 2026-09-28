import { Router, type CookieOptions, type Response } from "express";
import { z } from "zod";
import { TOKEN_COOKIE, TOKEN_TTL_SECONDS, signToken, type TokenUser } from "../../lib/token.js";
import { requireAuth } from "../../middleware/auth.js";
import * as auth from "./auth.service.js";

// Trim and lowercase first, then check the format
const email = z.string().trim().toLowerCase().pipe(z.email());
// The upper limit stops a huge "password" from making scrypt burn CPU
const signupBody = z.object({
  name: z.string().trim().min(1).max(50),
  email,
  password: z.string().min(8).max(200),
});
const loginBody = z.object({ email, password: z.string().max(200) });

// httpOnly: page scripts can't read it. lax: other sites can't send it with their requests.
const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
};

async function setLoginCookie(res: Response, user: TokenUser) {
  res.cookie(TOKEN_COOKIE, await signToken(user), { ...cookieOptions, maxAge: TOKEN_TTL_SECONDS * 1000 });
}

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const user = await auth.signup(signupBody.parse(req.body));
  if (!user) {
    res.status(409).json({ error: "This email is already registered" });
    return;
  }
  await setLoginCookie(res, user); // signed up = logged in
  res.status(201).json({ user });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = loginBody.parse(req.body);
  const user = await auth.login(email, password);
  if (!user) {
    res.status(401).json({ error: "Wrong email or password" });
    return;
  }
  await setLoginCookie(res, user);
  res.json({ user });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(TOKEN_COOKIE, cookieOptions);
  res.status(204).end();
});

authRouter.get("/me", requireAuth(), async (req, res) => {
  const user = await auth.findUser(req.user!.id);
  if (!user) {
    res.status(401).json({ error: "Please log in" });
    return;
  }
  res.json({ user });
});
