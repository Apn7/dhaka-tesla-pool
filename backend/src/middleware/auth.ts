import type { RequestHandler } from "express";
import { TOKEN_COOKIE, verifyToken, type Role, type TokenUser } from "../lib/token.js";

declare global {
  namespace Express {
    interface Request {
      user?: TokenUser;
    }
  }
}

// Lets the request through only with a valid login cookie, and one of `roles` if given
export function requireAuth(...roles: Role[]): RequestHandler {
  return async (req, res, next) => {
    // We read one cookie and JWT characters need no decoding, so no cookie-parser
    const token = req.headers.cookie
      ?.split("; ")
      .find((c) => c.startsWith(`${TOKEN_COOKIE}=`))
      ?.slice(TOKEN_COOKIE.length + 1);
    const user = token ? await verifyToken(token) : null;
    if (!user) {
      res.status(401).json({ error: "Please log in" });
      return;
    }
    if (roles.length > 0 && !roles.includes(user.role)) {
      res.status(403).json({ error: "Not allowed for your role" });
      return;
    }
    req.user = user;
    next();
  };
}
