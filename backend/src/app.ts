// Composes the Express app. Kept separate from server.ts so the app can be
// imported (e.g. by tests) without opening a port.
import express, { type Express } from "express";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import "./types/sessionUser.ts"; // registers the req.session.user type
import { sessionMiddleware } from "./auth/session.ts";
import { samlRoutes } from "./saml/samlRoutes.ts";
import { authRoutes } from "./routes/authRoutes.ts";
import { apiRoutes } from "./routes/apiRoutes.ts";

const frontendDist = fileURLToPath(new URL("../../frontend/dist", import.meta.url));

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(sessionMiddleware);

  app.use("/saml", samlRoutes);
  app.use("/auth", authRoutes);
  app.use("/api", apiRoutes);

  // Unknown backend paths get a JSON 404 instead of falling through to the SPA's
  // index.html with a misleading 200.
  app.use(["/saml", "/auth", "/api"], (req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // The built React app is served from the same origin as the API: no CORS,
  // and the session cookie just works. Unknown paths (e.g. /profile) get
  // index.html so the client-side page switch can handle them.
  app.use(express.static(frontendDist));
  app.get("/{*path}", (req, res) => res.sendFile(join(frontendDist, "index.html")));

  return app;
}
