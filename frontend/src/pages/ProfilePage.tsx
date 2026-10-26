import { useEffect, useState } from "react";
import { CircleCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FlowBadge } from "@/components/FlowBadge";
import { fetchMe, logout, type SessionUser } from "@/api";

// Accurate list of what the backend enforces (samlClient.ts + assertionValidator.ts)
// for each flow, so the reviewer can see the difference, not just a label.
const CHECKS_COMMON = [
  "XML signature on the assertion, against Auth0's pinned certificate",
  "Issuer is our Auth0 tenant",
  "Audience is our SP entity ID",
  "Recipient is our ACS URL",
  "Within NotBefore / NotOnOrAfter (±30s clock skew)",
  "Assertion ID never seen before (replay protection)",
];
const CHECKS_BY_FLOW = {
  "sp-initiated": ["InResponseTo matches an AuthnRequest we issued, single use (signed copy must match too)"],
  "idp-initiated": [
    "No InResponseTo: unsolicited, so the assertion-ID replay check is the only guard against reuse",
  ],
};

export function ProfilePage() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetchMe().then((u) => (u ? setUser(u) : window.location.replace("/")));
  }, []);

  if (!user) {
    return <main className="p-12 text-center text-sm text-muted-foreground">Loading session…</main>;
  }

  const rows: [string, string | null][] = [
    ["Email", user.email],
    ["Name", user.name],
    ["NameID (user key)", user.nameID],
    ["Issuer (IdP)", user.issuer],
    ["SessionIndex", user.sessionIndex],
    ["Authenticated at", new Date(user.authenticatedAt).toLocaleString()],
  ];

  async function handleLogout() {
    await logout();
    window.location.replace("/");
  }

  return (
    <main className="min-h-svh bg-muted/40 px-4 py-12">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">You arrived via</p>
            <FlowBadge flow={user.loginFlow} className="h-6 px-3 text-sm" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Logged in as: {user.email ?? user.nameID}
            </h1>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut /> Logout (this app only)
          </Button>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Identity from the SAML assertion</CardTitle>
              <CardDescription>Stored in a server-side session after the ACS accepted it.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3">
                {rows.map(([label, value], i) => (
                  <div key={label} className="flex flex-col gap-3">
                    {i > 0 && <Separator />}
                    <div>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="break-all text-sm">{value ?? "—"}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Checks this response passed</CardTitle>
              <CardDescription>Enforced by the backend before a session is created.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3">
                {[...CHECKS_COMMON, ...CHECKS_BY_FLOW[user.loginFlow]].map((check) => (
                  <li key={check} className="flex gap-2 text-sm">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    {check}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Raw SAML attributes</summary>
              <pre className="mt-4 overflow-x-auto rounded-md bg-muted p-4 text-xs">
                {JSON.stringify(user.attributes, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
