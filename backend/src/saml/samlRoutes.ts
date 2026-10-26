import express, { Router } from "express";
import { saml } from "./samlClient.ts";
import { verifyAssertion } from "./assertionValidator.ts";
import { safeReturnPath } from "./relayState.ts";
import { establishSession } from "../auth/session.ts";
import { config } from "../config.ts";

export const samlRoutes = Router();

// SP metadata: tells an IdP our entity ID and ACS URL. Auth0 is configured by
// hand (see README), but any SAML IdP admin can import this URL.
samlRoutes.get("/metadata", (req, res) => {
  res.type("application/xml").send(saml.generateServiceProviderMetadata(null, null));
});

// SP-initiated login: build an AuthnRequest and redirect the browser to Auth0.
// node-saml stores the request ID so the ACS can later require a matching
// InResponseTo (single use).
samlRoutes.get("/login", async (req, res) => {
  const relayState = safeReturnPath(req.query.returnTo);
  const url = await saml.getAuthorizeUrlAsync(relayState, req.get("host"), {});
  res.redirect(url);
});

// ACS: the one endpoint Auth0 POSTs to for BOTH flows. The response tells us
// which flow it was: SP-initiated carries InResponseTo, IdP-initiated doesn't.
samlRoutes.post("/acs", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const { profile } = await saml.validatePostResponseAsync(req.body);
    if (!profile) throw new Error("SAML response contained no profile");

    const user = verifyAssertion(profile);
    await establishSession(req, user);

    console.info(`[saml] login ok flow=${user.loginFlow} nameID=${user.nameID}`);
    res.redirect(config.frontendUrl + safeReturnPath(req.body.RelayState));
  } catch (err) {
    // Log the real reason for us; show the user a generic error. Detailed
    // validation errors would help an attacker tune a forged response.
    console.warn(`[saml] login rejected: ${(err as Error).message}`);
    res.redirect(`${config.frontendUrl}/?error=sso_failed`);
  }
});
