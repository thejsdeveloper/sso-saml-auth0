// App session. The SAML assertion is a one-time proof of login; after the ACS
// accepts it we issue our OWN session and never look at the assertion again.
//
// Why a server-side session (opaque cookie -> data on the server) instead of a
// signed JWT cookie: we can kill a session instantly on the server, which an
// IdP-initiated logout needs. A JWT stays valid until it expires.
//
// The default MemoryStore is fine for a single-process demo. Production would
// use a shared store (Redis), so sessions survive restarts and work across instances.
import type { Request } from "express";
import session from "express-session";
import { config } from "../config.ts";
import type { SessionUser } from "../types/sessionUser.ts";

export const SESSION_COOKIE = "sid";

export const sessionMiddleware = session({
  name: SESSION_COOKIE,
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false, // no cookie for anonymous visitors
  cookie: {
    httpOnly: true, // not readable from JS, so XSS can't steal it
    // Lax: sent on top-level GET navigations (the redirect after ACS) but not on
    // cross-site POSTs, which blocks CSRF against our own endpoints.
    sameSite: "lax",
    secure: config.isProduction, // HTTPS-only in prod; localhost is plain HTTP
    maxAge: config.sessionTtlMs,
  },
});

/** Start a fresh session for a newly authenticated user. */
export function establishSession(req: Request, user: SessionUser): Promise<void> {
  return new Promise((resolve, reject) => {
    // New session ID on every login prevents session fixation: an attacker
    // who planted a session ID before login can't ride the logged-in session.
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = user;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}
