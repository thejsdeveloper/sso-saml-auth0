// RelayState comes back from the IdP untouched. In IdP-initiated login anyone can
// put any value in it, so treating it as a redirect URL would make /saml/acs an
// open redirect (phishing: "log in at Auth0, land on evil.com"). We only accept
// known in-app paths.
const ALLOWED_RETURN_PATHS = new Set(["/profile"]);
export const DEFAULT_RETURN_PATH = "/profile";

export function safeReturnPath(relayState: unknown): string {
  return typeof relayState === "string" && ALLOWED_RETURN_PATHS.has(relayState)
    ? relayState
    : DEFAULT_RETURN_PATH;
}
