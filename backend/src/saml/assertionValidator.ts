// Checks that run AFTER node-saml has verified the signature, audience,
// timestamps and (for SP-initiated) InResponseTo.
//
// node-saml 5.x does not check these for login responses, which I confirmed by
// reading its source:
//   - Issuer: its `idpIssuer` option is only enforced on logout messages.
//   - SubjectConfirmationData/@Recipient: not checked at all.
//   - Assertion ID replay: it only tracks InResponseTo, which IdP-initiated
//     responses don't have.
//   - The signed copy of InResponseTo, when the outer copy has been removed.
//
// Every value checked here comes from profile.getAssertion(), i.e. the
// signature-verified assertion. The one exception is profile.inResponseTo
// (outer <Response>), which we only compare against its signed copy.
import type { Profile } from "@node-saml/node-saml";
import { config } from "../config.ts";
import type { SessionUser } from "../types/sessionUser.ts";
import { markAssertionUsed } from "./replayCache.ts";
import { PERSISTENT_NAMEID_FORMAT } from "./samlClient.ts";

const CLAIMS = {
  email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
};

// The parts of node-saml's xml2js output we read. Elements are arrays,
// attributes live under "$", text content under "_".
type XmlAttrs = Record<string, string | undefined>;
interface ParsedAssertion {
  $?: XmlAttrs;
  Issuer?: { _?: string }[];
  Subject?: { SubjectConfirmation?: { SubjectConfirmationData?: { $?: XmlAttrs }[] }[] }[];
  Conditions?: { $?: XmlAttrs }[];
}

export class AssertionRejectedError extends Error {}

function reject(reason: string): never {
  throw new AssertionRejectedError(reason);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Returns the identity we store in the session, or throws AssertionRejectedError. */
export function verifyAssertion(profile: Profile): SessionUser {
  const assertion = (profile.getAssertion?.() as { Assertion?: ParsedAssertion })?.Assertion;
  if (!assertion) reject("no verified assertion");

  // 1. Issuer: the signature already proves Auth0's key signed it; this also
  //    pins *which* IdP entity it claims to be, in case a key is ever shared.
  const issuer = assertion.Issuer?.[0]?._;
  if (issuer !== config.idp.issuer) reject(`unexpected issuer: ${issuer}`);

  // 2. Recipient: the assertion must have been issued for OUR ACS URL, so an
  //    assertion Auth0 issued to some other app can't be replayed here.
  const confirmData = (assertion.Subject?.[0]?.SubjectConfirmation ?? [])
    .map((sc) => sc.SubjectConfirmationData?.[0]?.$)
    .find((data) => data?.Recipient === config.sp.acsUrl);
  if (!confirmData) reject("no SubjectConfirmation for our ACS URL");

  // 3. Stable user key: refuse transient/email NameIDs so we never key a user
  //    on something that can change or be reassigned (see DECISIONS.md Q4).
  if (!profile.nameID || profile.nameIDFormat !== PERSISTENT_NAMEID_FORMAT) {
    reject(`expected a persistent NameID, got format ${profile.nameIDFormat}`);
  }

  // 4. Stripped InResponseTo: Auth0 puts InResponseTo both on the unsigned
  //    <Response> and inside the signed SubjectConfirmationData. node-saml's
  //    "ifPresent" mode only looks at the outer copy, so deleting it makes an
  //    SP-initiated response pass as unsolicited. The signed copy can't be
  //    removed, so if it exists the outer one must exist and match.
  const signedInResponseTo = confirmData.InResponseTo;
  if (signedInResponseTo && profile.inResponseTo !== signedInResponseTo) {
    reject("signed InResponseTo does not match the Response (stripped or altered)");
  }

  // 5. Replay: last, so only fully valid assertions take up space in the cache.
  const assertionId = assertion.$?.ID;
  if (!assertionId) reject("assertion has no ID");
  const notOnOrAfter = Date.parse(
    confirmData.NotOnOrAfter ?? assertion.Conditions?.[0]?.$?.NotOnOrAfter ?? "",
  );
  if (Number.isNaN(notOnOrAfter)) reject("assertion has no expiry");
  if (!markAssertionUsed(assertionId, notOnOrAfter + config.clockSkewMs)) {
    reject(`replayed assertion ${assertionId}`);
  }

  return {
    issuer,
    nameID: profile.nameID,
    email: stringOrNull(profile[CLAIMS.email]),
    name: stringOrNull(profile[CLAIMS.name]),
    sessionIndex: profile.sessionIndex ?? null,
    // Derived from the signed assertion, not from which button was clicked:
    // only SP-initiated responses answer a request of ours.
    loginFlow: signedInResponseTo ? "sp-initiated" : "idp-initiated",
    authenticatedAt: new Date().toISOString(),
    attributes: (profile.attributes as Record<string, unknown>) ?? {},
  };
}
