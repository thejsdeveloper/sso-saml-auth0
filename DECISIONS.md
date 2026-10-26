# Decisions & Design Notes

This is a running log. I started it before writing any code, because the ticket was the first thing that needed engineering.

> **The ticket:** "We need SSO for our platform. Set up Auth0 as our Identity Provider using SAML. Customers should be able to log in either by starting from Auth0's side or from our app's login page. Build the backend to handle this and a simple frontend so we can demo both flows. Should be straightforward, similar integrations exist online."

---

## 1. Questions I would ask the PM, and what I assumed instead

| #   | Question                                                                                        | Why it matters                                                                                                                                          | What I assumed                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Who is the "customer": individual end users, or companies whose employees log in?               | Decides whether we need multiple tenants, per-customer IdP config and "which IdP does this email belong to" routing.                                    | **One B2B customer**, whose employees log in. Auth0 stands in for that customer's corporate IdP. One IdP config only (multi-tenant is out of scope). |
| Q2  | Does the customer specifically require SAML, or do they just need SSO?                          | If we control both sides, OIDC is simpler and less error-prone. SAML is usually chosen because enterprise IdPs demand it.                               | **SAML is a customer requirement.** I would still raise OIDC as an option for customers who support it.                                              |
| Q3  | Is IdP-initiated login a hard requirement?                                                      | IdP-initiated responses are unsolicited, so the SP can't tie them to a request it made. That removes SAML's strongest anti-replay / anti-CSRF check.    | **Yes, it's explicitly asked for.** I support it, with compensating controls (see #3). In production I'd want it as a per-customer opt-in.           |
| Q4  | What uniquely identifies a user in our system?                                                  | Email is mutable and can be reassigned (an employee leaves and someone new gets the address). Keying on email can hand one person's account to another. | Key = **(IdP entityID, NameID)**, with Auth0 sending a stable, persistent NameID (the Auth0 `user_id`). Email and name are profile attributes only.  |
| Q5  | On first login, do we auto-create the user (JIT provisioning) or require them to exist already? | Decides onboarding UX and whether an IdP admin can grant access on their own.                                                                           | **JIT**: any user the trusted IdP authenticates gets in. No DB for this demo; production would upsert on the key from Q4.                            |
| Q6  | Should SSO users be linked to existing password accounts with the same email?                   | Auto-linking by email is a classic account-takeover vector.                                                                                             | **No auto-linking.** Out of scope; would require an explicit, verified linking flow.                                                                 |
| Q7  | Where should a user land after IdP-initiated login?                                             | There is no "original page" to return to.                                                                                                               | A fixed default page (`/profile`). `RelayState` is honoured only if it is on an allow-list of in-app paths (prevents open redirect).                 |
| Q8  | How long should an app session last, and must it end when the Auth0 session ends?               | This is the core of the logout problem.                                                                                                                 | App session has its own fixed lifetime (1 hour for the demo), independent of Auth0. See #6.                                                          |
| Q9  | Is authorization (roles/permissions) needed?                                                    | Changes which attributes we map.                                                                                                                        | **Authentication only**, per the brief.                                                                                                              |

## 2. Where the ticket is wrong, ambiguous or incomplete

- **"Set up Auth0 as _our_ Identity Provider."** In real B2B SSO, the _customer_ brings their own IdP (Okta, Entra ID, Google Workspace) and we are the Service Provider. Auth0 is then usually a broker in the middle, not "our IdP". For this exercise, Auth0 plays the customer's IdP. The production design should assume N customer IdPs.
- **"Should be straightforward, similar integrations exist online."** Most online samples get IdP-initiated login to "work" by turning off `InResponseTo` validation or skipping replay protection. Doing that would look identical in a demo but be insecure. I treated security validation as the main deliverable.
- **Logout isn't mentioned**, but SSO without a logout story is incomplete. See #6.
- **No non-functional requirements** (session length, audit logging, which attributes are allowed). Assumed minimal defaults; listed in #5.

## 3. Key design decisions & trade-offs

_To be filled in as I build: library choice, session strategy, replay protection, SP- vs IdP-initiated validation, attribute mapping._

## 4. AI usage

_To be filled in._

## 5. What I'd do next with another day

_To be filled in._

## 6. Logout (SP- and IdP-initiated)

_To be filled in._
