export type LoginFlow = "sp-initiated" | "idp-initiated";

/** What we keep in the session after a successful SAML login. */
export interface SessionUser {
  // (issuer, nameID) is the user key; see DECISIONS.md.
  issuer: string;
  nameID: string;
  email: string | null;
  name: string | null;
  sessionIndex: string | null; // needed later for SAML logout
  loginFlow: LoginFlow;
  authenticatedAt: string;
  attributes: Record<string, unknown>;
}

// Teach express-session what lives in req.session.
declare module "express-session" {
  interface SessionData {
    user: SessionUser;
  }
}
