import { Router } from "express";
import { destroySession, SESSION_COOKIE } from "../auth/session.ts";

export const authRoutes = Router();

// Local logout only: ends OUR session, not the Auth0 session. See the logout
// section in DECISIONS.md for what this does and doesn't cover.
// POST (not GET), so another site can't log users out with an <img> tag.
authRoutes.post("/logout", async (req, res) => {
  if (req.session) await destroySession(req);
  res.clearCookie(SESSION_COOKIE);
  res.status(204).end();
});
