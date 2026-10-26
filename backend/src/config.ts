// Loads and validates configuration once at startup. Failing fast here is better
// than discovering a missing IdP cert on the first login attempt.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const baseUrl = required("APP_BASE_URL").replace(/\/$/, "");

export const config = {
  port: Number(process.env.PORT ?? 3000),
  isProduction: process.env.NODE_ENV === "production",
  baseUrl,
  // Where the browser goes after login. Same as baseUrl when the backend serves
  // the built React app; http://localhost:5173 when running the Vite dev server.
  frontendUrl: (process.env.FRONTEND_URL ?? baseUrl).replace(/\/$/, ""),
  sessionSecret: required("SESSION_SECRET"),

  sp: {
    entityId: required("SP_ENTITY_ID"),
    acsUrl: `${baseUrl}/saml/acs`,
  },

  idp: {
    entryPoint: required("IDP_ENTRY_POINT"),
    issuer: required("IDP_ISSUER"),
    // The IdP cert is pinned from config. We never trust a cert embedded in the
    // incoming XML, otherwise anyone could sign an assertion with their own key.
    cert: readFileSync(resolve(required("IDP_CERT_PATH")), "utf8"),
  },

  // Tolerance for clock drift between Auth0 and this server when checking
  // NotBefore / NotOnOrAfter.
  clockSkewMs: 30_000,
  // How long a user has to finish logging in at Auth0 after we send them there.
  authnRequestTtlMs: 10 * 60_000,
  sessionTtlMs: 60 * 60_000,
} as const;
