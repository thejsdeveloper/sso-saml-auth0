export type LoginFlow = "sp-initiated" | "idp-initiated";

// Mirrors the object built in backend/src/saml/assertionValidator.ts.
export interface SessionUser {
  issuer: string;
  nameID: string;
  email: string | null;
  name: string | null;
  sessionIndex: string | null;
  loginFlow: LoginFlow;
  authenticatedAt: string;
  attributes: Record<string, unknown>;
}

export async function fetchConfig(): Promise<{ idpInitiatedLoginUrl: string }> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error(`GET /api/config failed: ${res.status}`);
  return res.json();
}

/** Returns null when there is no session (401). */
export async function fetchMe(): Promise<SessionUser | null> {
  const res = await fetch("/api/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /api/me failed: ${res.status}`);
  return (await res.json()).user;
}

export async function logout(): Promise<void> {
  await fetch("/auth/logout", { method: "POST" });
}
