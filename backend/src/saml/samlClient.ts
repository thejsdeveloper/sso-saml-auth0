// The single configured node-saml instance. All SAML protocol work (building
// AuthnRequests, verifying XML signatures, audience and time checks) is delegated
// to the library; see assertionValidator.ts for the checks it does NOT do.
import { SAML, ValidateInResponseTo } from "@node-saml/node-saml";
import { config } from "../config.ts";

export const PERSISTENT_NAMEID_FORMAT =
  "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent";

export const saml = new SAML({
  // --- Who we are (SP) ---
  issuer: config.sp.entityId,
  audience: config.sp.entityId,
  callbackUrl: config.sp.acsUrl,
  identifierFormat: PERSISTENT_NAMEID_FORMAT,

  // --- Who we trust (IdP) ---
  entryPoint: config.idp.entryPoint,
  idpCert: config.idp.cert,

  // Auth0 signs the Assertion, not the outer Response. Requiring the assertion
  // signature is the stronger choice anyway: everything we read (NameID,
  // attributes, Recipient, Audience) lives inside the signed assertion.
  wantAssertionsSigned: true,
  wantAuthnResponseSigned: false,

  // "ifPresent" is what lets ONE ACS endpoint serve both flows:
  // - SP-initiated: the response carries InResponseTo, and it must match a
  //   request we issued (single use, expires after authnRequestTtlMs).
  // - IdP-initiated: no InResponseTo, so the library can't tie the response to
  //   anything. The assertion-ID replay cache covers that case.
  validateInResponseTo: ValidateInResponseTo.ifPresent,
  requestIdExpirationPeriodMs: config.authnRequestTtlMs,

  acceptedClockSkewMs: config.clockSkewMs,

  // Let the IdP's own policy (password, MFA, ...) decide how to authenticate.
  disableRequestedAuthnContext: true,
});
