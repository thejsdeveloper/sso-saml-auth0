# SAML SSO with Auth0 (SP-initiated + IdP-initiated)

A minimal SAML 2.0 **Service Provider** (Node.js + TypeScript) with **Auth0 as the Identity Provider**, and a small React UI that demonstrates both login flows and shows the identity from the SAML assertion.

> **Start with [DECISIONS.md](./DECISIONS.md).** It holds the assumptions, trade-offs, security reasoning and the logout design.

```
Browser ──► Node/Express (localhost:3000)
              ├─ /saml/metadata   SP metadata
              ├─ /saml/login      SP-initiated login (builds AuthnRequest → Auth0)
              ├─ /saml/acs        Assertion Consumer Service (both flows)
              ├─ /api/me          session-protected: current user's identity
              ├─ /auth/logout     local logout
              └─ /*               React app (frontend/dist)
```

## Test access

|                          |                                           |
| ------------------------ | ----------------------------------------- |
| Auth0 tenant (dev, free) | `thejsdeveloper-saml-demo.us.auth0.com`   |
| Test user                | `demo.user@example.com`                   |
| Password                 | Sent separately with the submission email |

This is a free dev tenant with a fake test user, no real data. A video walkthrough of both flows is here: `<TODO: Loom link>`.

## Run it locally

**Prerequisites:** Node.js **≥ 22.18** (tested on 24). The backend runs TypeScript directly, with no build step.

```bash
git clone https://github.com/thejsdeveloper/sso-saml-auth0.git && cd sso-saml-auth0

# 1. Frontend: build once; the backend serves it
cd frontend
npm ci
npm run build

# 2. Backend
cd ../backend
npm ci
cp .env.example .env
#    Fill .env with the demo-tenant values listed below, and generate a session secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

#    Download Auth0's public signing certificate (public key, safe to fetch):
mkdir -p certs
curl -sf https://thejsdeveloper-saml-demo.us.auth0.com/pem -o certs/auth0-idp.pem

npm start            # → http://localhost:3000
```

Values for `.env` with the demo tenant:

```
APP_BASE_URL=http://localhost:3000
SP_ENTITY_ID=urn:sso-saml-demo:sp
IDP_ENTRY_POINT=https://thejsdeveloper-saml-demo.us.auth0.com/samlp/HNeMgCnEuxzIp9lSTk8ym1Ag3ZtMoFKL
IDP_ISSUER=urn:thejsdeveloper-saml-demo.us.auth0.com
IDP_CERT_PATH=./certs/auth0-idp.pem
SESSION_SECRET=<generated above>
```

The app must run on `http://localhost:3000`: that ACS URL is registered in Auth0, and the backend checks that each assertion was issued for exactly that URL.

## Demo the two flows

Open **http://localhost:3000**. The login page has one card per flow. After logging in, the profile page shows a badge saying which flow was used. The badge is derived from the SAML response itself (`InResponseTo` present or not), not from which button you clicked.

### SP-initiated login (starts at our app)

1. Click **Login with SSO** (or open http://localhost:3000/saml/login).
2. Our backend sends you to Auth0 with an `AuthnRequest`. Sign in with the test user.
3. You land on `/profile` with a blue **SP-initiated login** badge.

### IdP-initiated login (starts at Auth0)

1. Open the Auth0 IdP login URL directly. Either click **Go to Auth0** on the login page (it links straight to Auth0, not through our backend), or paste this into a new tab:
   ```
   https://thejsdeveloper-saml-demo.us.auth0.com/samlp/HNeMgCnEuxzIp9lSTk8ym1Ag3ZtMoFKL
   ```
2. Sign in at Auth0. If you already have an Auth0 session, this step is skipped.
3. Auth0 POSTs an unsolicited response to our ACS. You land on `/profile` with an amber **IdP-initiated login** badge.

### Logout

**Logout** on the profile page ends **this app's session only**; the Auth0 session stays. You'll see this when you log in again: no password prompt. Full logout (SP- and IdP-initiated SLO) was not built. The design is in [DECISIONS.md #6](./DECISIONS.md#6-logout-sp--and-idp-initiated).

## Verify the security checks

`backend/scripts/attackAcs.ts` re-sends a captured `SAMLResponse` to the ACS to show replays and tampering are rejected. Results are in [DECISIONS.md #3.10](./DECISIONS.md#310-verifying-the-validation-manual-attack-tests).

1. Keep the backend running in one terminal (don't restart it, because the replay cache is in memory).
2. In Chrome DevTools → Network (tick **Preserve log**), log in, open the `acs` request → **Payload** → copy the `SAMLResponse` value.
3. Within 5 minutes (the assertion lifetime), in `backend/`:
   ```bash
   pbpaste > captures/sp.txt   # macOS; elsewhere paste into captures/sp.txt with any editor
                               # captures/ is git-ignored: these are real login tokens
   node scripts/attackAcs.ts captures/sp.txt replay
   node scripts/attackAcs.ts captures/sp.txt strip-in-response-to
   node scripts/attackAcs.ts captures/sp.txt tamper-email
   ```
4. The server log shows the reason for each rejection (`InResponseTo is not valid`, `signed InResponseTo does not match the Response …`, `Invalid signature`).

## Auth0 configuration (to reproduce on your own tenant)

1. **Applications → Create Application** → _Regular Web Application_. Under **Connections**, enable `Username-Password-Authentication`.
2. **Addons → SAML2 Web App** → enable. **Application Callback URL:** `http://localhost:3000/saml/acs`. **Settings:**
   ```json
   {
     "audience": "urn:sso-saml-demo:sp",
     "recipient": "http://localhost:3000/saml/acs",
     "destination": "http://localhost:3000/saml/acs",
     "nameIdentifierFormat": "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
     "nameIdentifierProbes": [
       "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
     ],
     "signatureAlgorithm": "rsa-sha256",
     "digestAlgorithm": "sha256",
     "lifetimeInSeconds": 300,
     "passthroughClaimsWithNoMapping": false,
     "mapIdentities": false
   }
   ```
   Each setting is explained in [DECISIONS.md #3.6](./DECISIONS.md#36-auth0-configuration--attribute-mapping).
3. **Addons → SAML2 Web App → Usage** gives the Issuer and the Identity Provider Login URL for `.env`.
4. **User Management → Users → Create User** for a test account.

Our SP metadata, which an IdP admin could import, is at http://localhost:3000/saml/metadata.

## Frontend dev mode (optional)

For hot reload on the UI:

```bash
cd backend  && FRONTEND_URL=http://localhost:5173 npm run dev   # ACS redirects back to Vite
cd frontend && npm run dev                                      # http://localhost:5173
```

Vite proxies `/api`, `/saml` and `/auth` to the backend.

## Project structure

```
backend/
  src/
    config.ts                 env loading + validation (fails fast)
    app.ts / server.ts        express composition / entry point
    saml/
      samlClient.ts           node-saml configuration
      samlRoutes.ts           /saml/metadata, /saml/login, /saml/acs
      assertionValidator.ts   checks node-saml doesn't do: issuer, recipient, NameID format, replay
      replayCache.ts          assertion-ID replay cache
      relayState.ts           RelayState allow-list (open-redirect protection)
    auth/
      session.ts              server-side session, regenerate on login
      requireAuth.ts          401 guard for API routes
    routes/                   /api and /auth routes
    types/                    SessionUser type
  scripts/attackAcs.ts        replay/tamper test tool
frontend/                     Vite + React + TypeScript + shadcn/ui
DECISIONS.md                  assumptions, trade-offs, logout design
```

Scripts: `npm run typecheck` (both packages), `npm run build` (frontend), `npm start` / `npm run dev` (backend).
