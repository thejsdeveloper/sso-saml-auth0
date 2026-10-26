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

### 3.1 Architecture

```
Browser ──► Node/Express (localhost:3000)
              ├─ /saml/*   SAML SP: metadata, login (SP-initiated), ACS (both flows)
              ├─ /auth/*   logout
              ├─ /api/*    session-protected identity endpoint + public config
              └─ /*        built React app (frontend/dist)
                    ▲
Auth0 (IdP) ────────┘ POSTs signed SAMLResponse to /saml/acs
```

- **One origin for API and UI.** The backend serves the built React app. No CORS, and the session cookie works without cross-site settings. In dev, Vite proxies backend routes.
- **Code layout:** `saml/` (protocol: client config, routes, assertion checks, replay cache, RelayState), `auth/` (session + guard), `routes/` (non-SAML HTTP), `config.ts` (all env, validated at startup).
- **TypeScript without a build step.** Node ≥ 22.18 strips types natively; `tsc --noEmit` is only the type checker. The code that runs is the code you read.

### 3.2 SAML library: `@node-saml/node-saml` 5.x

Maintained, the core of `passport-saml`, and uses `xml-crypto` for XML signature validation, so I don't hand-roll XML-DSig (the brief forbids it, and it's the classic source of signature-wrapping bugs). I skipped Passport: it adds a strategy layer I don't need for one IdP.

**I read the library source rather than trusting the option names.** For login responses it:

| Check                                                    | node-saml does it?                                   | Where it happens                           |
| -------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| XML signature against the pinned IdP cert                | ✅                                                   | `wantAssertionsSigned: true`               |
| Rejects multiple assertions (signature-wrapping defense) | ✅                                                   | built-in                                   |
| Audience = our SP entity ID                              | ✅                                                   | `audience`                                 |
| NotBefore / NotOnOrAfter (±30s skew)                     | ✅                                                   | `acceptedClockSkewMs`                      |
| InResponseTo matches a request we issued, single use     | ✅ (when present)                                    | `validateInResponseTo: "ifPresent"`        |
| **Issuer** = our Auth0 tenant                            | ❌ `idpIssuer` is only enforced on _logout_ messages | `assertionValidator.ts`                    |
| **Recipient** = our ACS URL                              | ❌ not checked                                       | `assertionValidator.ts`                    |
| **Assertion ID replay**                                  | ❌ only InResponseTo is tracked                      | `assertionValidator.ts` + `replayCache.ts` |
| NameID is `persistent`                                   | ❌                                                   | `assertionValidator.ts`                    |
| Signed `InResponseTo` when the outer copy is missing     | ❌ `ifPresent` only looks at the outer copy          | `assertionValidator.ts`                    |

### 3.3 One ACS for both flows, and the risk that comes with it

`validateInResponseTo: "ifPresent"` is what lets one endpoint accept both flows: if the response has an `InResponseTo`, it must match an outstanding request; if not, it's treated as IdP-initiated.

The weakness: Auth0 puts `InResponseTo` in **two** places: on the outer `<Response>` (unsigned) and inside the assertion's `SubjectConfirmationData` (signed). node-saml's `ifPresent` mode decides "SP- or IdP-initiated?" from the **outer, unsigned** copy only. So an attacker holding a captured SP-initiated response can delete that attribute without breaking the signature, and the library treats the response as unsolicited and skips its checks.

Two layers stop this:

1. **Signed-copy check** (`assertionValidator.ts`): if the signed `InResponseTo` is present, the outer one must exist and match. A stripped response is rejected directly.
2. **Assertion-ID replay cache:** even if a stripped response got past layer 1, the assertion ID (also signed) has already been used.

My first version only had layer 2. A review pointed out the signed copy, which I'd seen in the captured XML but hadn't used. Adding layer 1 also lets the UI's flow label come from signed data (3.9).

What IdP-initiated still can't defend against: **login CSRF**. An attacker can take a fresh, never-used assertion for _their own_ account and make a victim's browser POST it, logging the victim in as the attacker. Nothing in an unsolicited response ties it to the victim's browser. Options for production, in order of preference:

1. **Bounce pattern:** the ACS doesn't create a session from unsolicited responses. It redirects to `/saml/login`, which does a normal SP-initiated round trip. Because the user already has an Auth0 session, it's instant for them, and every session then comes from a request we issued.
2. Make IdP-initiated a **per-customer opt-in** for customers whose portals need it.

I didn't build the bounce because the brief explicitly asks for an ACS that _accepts_ IdP-initiated assertions. This is the first thing I'd raise with the PM.

### 3.4 Replay protection

- In-memory `Map<assertionId, expiresAt>`, entries kept until `NotOnOrAfter + clock skew`. After that, the time check rejects the assertion anyway, so memory stays bounded.
- Check-and-set in one call (`markAssertionUsed`), so there's no gap between "is it new?" and "remember it".
- Recorded **only after every other check passes**, so garbage or forged responses can't fill the cache.
- I cut Auth0's assertion lifetime from the default 3600s to **300s**, shrinking both the replay window and the cache.
- **Limitation:** per-process memory. Multiple instances or a restart would allow a replay. Production: Redis `SET id 1 NX PX <ttl>` (atomic check-and-set across instances). The same applies to node-saml's request-ID cache.

### 3.5 Trust and signatures

- **IdP cert pinned from config** (`IDP_CERT_PATH`), never taken from the `KeyInfo` in the incoming XML. Otherwise anyone could sign with their own key.
- **Assertion signed, response not** (Auth0's default). Requiring the assertion signature is stronger, because everything we _use_ (NameID, attributes, Audience, Recipient) is inside it. The only unsigned value we read is the outer `InResponseTo`, and we always compare it with its signed copy (3.3).
- **SHA-256** forced in Auth0 (`signatureAlgorithm`/`digestAlgorithm`) rather than relying on defaults.
- **AuthnRequests are not signed.** Auth0 doesn't require it, and it would mean managing an SP key pair (key management is out of scope). Needed for SLO; see #6.

### 3.6 Auth0 configuration & attribute mapping

SAML2 Web App addon settings (full JSON in the README):

| Setting                                           | Value                                     | Why                                                                                                                             |
| ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `audience`                                        | `urn:sso-saml-demo:sp`                    | Our entity ID. Required for IdP-initiated, where no request tells Auth0 who we are. A URN, so it doesn't change with hostnames. |
| `recipient` / `destination`                       | `http://localhost:3000/saml/acs`          | Lets us verify the assertion was meant for our ACS.                                                                             |
| `nameIdentifierFormat`                            | `persistent`                              | Stable user key (Q4).                                                                                                           |
| `nameIdentifierProbes`                            | only `nameidentifier` (= Auth0 `user_id`) | By default Auth0 falls back to email/name for NameID; this prevents that.                                                       |
| `lifetimeInSeconds`                               | `300`                                     | Smaller replay window (3.4).                                                                                                    |
| `passthroughClaimsWithNoMapping`, `mapIdentities` | `false`                                   | Data minimization: only standard claims, not the full Auth0 profile or upstream identity details.                               |

Attributes used: `emailaddress` and `name` (display only). The **NameID is the identity**; attributes are profile data.

### 3.7 User keying & JIT provisioning (design only, no DB)

- Key: **`(idp_issuer, name_id)`**, unique together. Including the issuer means two IdPs can't collide on the same NameID, which matters once there are multiple customers.
- Email stored as a **non-unique, updatable** attribute, refreshed on every login from the assertion.
- JIT: on ACS success, `INSERT ... ON CONFLICT (idp_issuer, name_id) DO UPDATE SET email, name, last_login_at`. The session then holds our internal `user.id`, not the SAML data.
- Never auto-link to an existing account by email (Q6).

### 3.8 Session strategy

- **Server-side session** (`express-session`, opaque `sid` cookie) rather than a signed JWT cookie. The deciding factor is logout: a server-side session can be destroyed instantly, including by an IdP-initiated logout arriving from Auth0, while a JWT stays valid until it expires (unless you add a denylist, which is a server-side store again).
- `req.session.regenerate()` on login, to prevent **session fixation**.
- Cookie: `HttpOnly` (XSS can't read it), `SameSite=Lax` (not sent on cross-site POSTs, which protects our endpoints from CSRF), `Secure` in production, 1h lifetime.
- `SameSite=Lax` and SAML: Auth0's POST to the ACS is cross-site, so the browser does **not** send our cookie on it. That's fine, because the ACS doesn't need an existing session; it creates a new one and redirects (a top-level GET), and the cookie is sent from then on.
- MemoryStore is fine for a single-process demo. Production: Redis-backed store.

### 3.9 Smaller decisions

- **RelayState** is checked against an allow-list (`/profile`). In IdP-initiated login anyone can set it, so following it blindly would make the ACS an open redirect.
- **Errors:** the browser only sees `?error=sso_failed`; the real reason is logged server-side. Detailed errors would help an attacker tune a forged response.
- **Logout is a `POST`**, so another site can't log users out with an `<img>` tag.
- **The flow label in the UI** comes from the signed assertion (is there an `InResponseTo` in `SubjectConfirmationData`?), not from which button was clicked. The demo can't fake the difference.
- **Unknown `/api`, `/saml`, `/auth` paths** return a JSON 404 instead of falling through to the React app's `index.html` with a 200.
- **Frontend:** React + TypeScript + shadcn/ui. I didn't use shadcn's login blocks: they're email/password forms, and with SSO our app should never handle passwords.
- **Duplicated `SessionUser` type** in backend and frontend. A shared package isn't worth it for eight fields.

### 3.10 Verifying the validation (manual attack tests)

I captured real `SAMLResponse`s from the browser and re-sent them with `backend/scripts/attackAcs.ts`. Each attack was rejected by the layer I expected:

| Attack                                                             | Rejected by                                                               | Server log                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------ |
| Replay an SP-initiated response                                    | node-saml: `InResponseTo` already consumed                                | `InResponseTo is not valid`    |
| Replay an IdP-initiated response                                   | Our assertion-ID replay cache                                             | `replayed assertion _d1O6...`  |
| Strip `InResponseTo` from an SP-initiated response, then replay it | Signed-copy check (3.3, layer 1)                                          | `signed InResponseTo does not match the Response (stripped or altered)` |
| Change the email inside the signed assertion                       | Signature validation                                                      | `Invalid signature`            |

The third row is the important one: it's the 3.3 weakness. Before I added the signed-copy check, this attack got past node-saml and was only caught by the replay cache (`replayed assertion _0AluE...`). Now it's stopped one layer earlier, and the replay cache is a backup rather than the only defense.

Lesson from the first attempt: checks run in layers and the first failure wins. My first run of the strip test was rejected as _expired_ (the assertion was older than 5 minutes), which proved nothing about the replay cache. I re-ran it with a fresh capture.

## 4. AI usage

- I used **Claude Code** as a pair programmer throughout: to break down the ticket, draft the PM questions, scaffold the Express/React structure, and draft this document.
- **How I verified, rather than trusting the output:**
  - Read the `@node-saml/node-saml` **source** (`lib/saml.js`) for the options we rely on. This is how the issuer/recipient/replay gaps in #3.2 were found; the option names alone suggest otherwise (`idpIssuer`).
  - Had a second AI agent review the submission against the assignment. It caught that I ignored the signed copy of `InResponseTo` (3.3). I verified this against my captured responses and the library source before fixing it.
  - Attacked my own ACS with captured responses (#3.10) to prove each check actually fires.
  - Checked an unfamiliar dependency the shadcn CLI added (`cn`) before accepting it.
  - Walked through every file until I could explain each decision without notes.

## 5. What I'd do next with another day

In priority order:

1. **Automated tests for the ACS:** fixture responses signed with a test key, one test per rejection reason (bad signature, wrong audience/recipient/issuer, expired, replay, stripped `InResponseTo`, transient NameID). The manual attack script becomes a regression suite.
2. **Close the IdP-initiated login-CSRF gap** with the bounce pattern (3.3), after agreeing it with the PM.
3. **Shared state in Redis:** sessions, replay cache and AuthnRequest IDs, so it works across instances and restarts.
4. **Logout:** Auth0 session termination first, then SAML SLO (#6).
5. **Persist users** with JIT upsert on `(issuer, nameID)` (3.7).
6. **Audit logging:** structured login success/failure events (who, which IdP, which check failed) for security monitoring.
7. **Production hardening:** HTTPS + `Secure` cookies, security headers/CSP, rate limiting on the ACS, IdP cert rollover (accept old and new cert during rotation).
8. **Multi-tenant:** per-customer IdP config (imported from IdP metadata) and routing users to their company's IdP.

## 6. Logout (SP- and IdP-initiated)

**Built:** a local logout only (`POST /auth/logout` destroys our session). **Not built:** Auth0 session termination and SAML Single Logout. This is a design write-up for those.

### There are three sessions, not one

1. **Our app session** (`sid` cookie → server-side session). Source of truth for "logged in to _our app_".
2. **Auth0's SSO session** (cookie on the Auth0 domain). Source of truth for "logged in to the _IdP_".
3. **Other apps' sessions** that use the same Auth0 login.

"Logged out" has to say which of these it ends. Today's button only ends #1. That's why, after logging out, clicking _Login with SSO_ logs you straight back in without a password: Auth0's session (#2) is still alive. You can see this in the demo.

### SP-initiated logout (user clicks Logout in our app)

- **Step 1, pragmatic (~1h):** destroy our session, then redirect to Auth0's `/v2/logout?client_id=…&returnTo=http://localhost:3000/` (`returnTo` must be in the app's _Allowed Logout URLs_). That ends #1 and #2, but not #3.
- **Step 2, full SAML SLO:** send a `LogoutRequest` carrying the user's `NameID` + `SessionIndex` (this is why the session already stores `sessionIndex`) to Auth0's SAML logout endpoint. Auth0 ends its session, notifies the other SAML apps, and sends a `LogoutResponse` back to our SLO endpoint. This needs an **SP signing key pair**, because logout requests must be signed so nobody can forge "log this user out".

### IdP-initiated logout (logout happens at Auth0 or another app)

- Configure the addon's logout callback (our `/saml/slo` URL, SLO enabled). Auth0 sends us a signed `LogoutRequest` through the user's browser.
- `/saml/slo` validates it (signature, issuer; node-saml _does_ check the issuer for logout messages), then destroys the matching sessions and replies with a `LogoutResponse`.
- **Important detail:** I'm assuming the HTTP-POST binding for SLO (the same binding as login). The request then arrives as a cross-site POST, so with `SameSite=Lax` **our cookie is not sent**. (With the HTTP-Redirect binding, a GET, the Lax cookie *would* be sent, but logout must still work if the cookie is missing or expired.) Either way, we can't rely on destroying "the current session". We have to find sessions by `(issuer, NameID, SessionIndex)`, which means keeping a server-side index from user to session IDs. This is the main reason I chose server-side sessions over JWTs (3.8): with a JWT there would be nothing to destroy.

### What can go wrong

| Problem                          | Effect                                                                                                | Mitigation                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Auth0 session outlives ours      | Logout looks broken: next login is silent                                                             | Call Auth0 logout (step 1), or send `ForceAuthn` on the next login                    |
| Our session outlives Auth0's     | User logged out at Auth0 but still in our app for up to 1h                                            | IdP-initiated SLO; short app sessions; silent re-check with `IsPassive` AuthnRequests |
| Front-channel SLO is fragile     | Closed tab, blocked third-party cookies, or one app failing stops the chain, leaving a partial logout | Treat SLO as best-effort; short session lifetimes are the real backstop               |
| Forged or replayed LogoutRequest | Attacker logs users out (DoS)                                                                         | Signature + issuer check, request ID/timestamp checks                                 |
| Logout CSRF on our endpoint      | Another site logs our users out                                                                       | Logout is `POST` with a `SameSite=Lax` cookie (done)                                  |

### Plan for "a few more hours"

1. Auth0 `/v2/logout` redirect after local logout (quick win, fixes the silent re-login).
2. Generate an SP key pair (cert to Auth0, key in config) and configure node-saml `privateKey`, `logoutUrl`, `logoutCallbackUrl`.
3. Add an index `(issuer, nameID) → sessionIds` next to the session store.
4. `GET /saml/logout` → `getLogoutUrlAsync()`. `/saml/slo` handles both an incoming `LogoutRequest` (IdP-initiated) and the `LogoutResponse` (end of SP-initiated).
5. Test with two browsers: log out in one place, confirm the other session ends.
