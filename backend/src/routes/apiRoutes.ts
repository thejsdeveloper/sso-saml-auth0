import { Router } from "express";
import { requireAuth } from "../auth/requireAuth.ts";
import { config } from "../config.ts";

export const apiRoutes = Router();

// Public: lets the login page link straight to Auth0 for the IdP-initiated demo.
// The browser goes to Auth0 directly, without sending an AuthnRequest.
apiRoutes.get("/config", (req, res) => {
  res.json({ idpInitiatedLoginUrl: config.idp.entryPoint });
});

// Session-protected endpoint: returns the identity captured from the SAML assertion.
apiRoutes.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});
