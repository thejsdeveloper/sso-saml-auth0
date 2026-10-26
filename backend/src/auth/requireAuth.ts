import type { NextFunction, Request, Response } from "express";

// API guard: 401 JSON rather than a redirect, because the frontend calls these
// endpoints with fetch() and decides itself where to send the user.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.user) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  next();
}
