// Remembers assertion IDs we have already accepted, so a captured SAMLResponse
// cannot be POSTed to /saml/acs a second time.
//
// An ID only needs to be remembered until the assertion expires
// (NotOnOrAfter + clock skew). After that the time check rejects it anyway, so
// memory stays bounded.
//
// Limitation: this is per-process memory. With more than one instance, or across
// restarts, it must move to a shared store (e.g. Redis `SET key 1 NX PX ttl`),
// otherwise an assertion could be replayed against a different instance.
const seen = new Map<string, number>(); // assertionId -> expiresAtMs

function sweep(now: number): void {
  for (const [id, expiresAt] of seen) {
    if (expiresAt <= now) seen.delete(id);
  }
}

/**
 * Records the ID and returns true if this is the first time we see it,
 * false if it is a replay. Check-and-set in one step, so there is no gap
 * between "check" and "remember".
 */
export function markAssertionUsed(assertionId: string, expiresAtMs: number): boolean {
  const now = Date.now();
  sweep(now);
  if (seen.has(assertionId)) return false;
  seen.set(assertionId, expiresAtMs);
  return true;
}
