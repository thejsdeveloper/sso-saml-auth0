import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FlowBadge } from "@/components/FlowBadge";
import { fetchConfig, type LoginFlow } from "@/api";

const hasError = new URLSearchParams(window.location.search).has("error");

const STEPS: Record<LoginFlow, ReactNode[]> = {
  "sp-initiated": [
    "You click the button below.",
    <>Our backend creates an <code>AuthnRequest</code>, remembers its ID and sends you to Auth0.</>,
    "You sign in at Auth0.",
    <>Auth0 POSTs a signed response to our ACS, quoting that ID in <code>InResponseTo</code>.</>,
  ],
  "idp-initiated": [
    "You open Auth0 directly, like an app tile in a company SSO portal.",
    "Our app is not involved, so there is no request to answer.",
    "You sign in at Auth0 (skipped if you already have an Auth0 session).",
    <>Auth0 POSTs an <em>unsolicited</em> signed response to our ACS.</>,
  ],
};

function Steps({ flow }: { flow: LoginFlow }) {
  return (
    <ol className="space-y-3">
      {STEPS[flow].map((step, i) => (
        <li key={i} className="flex gap-3 text-sm text-muted-foreground">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
            {i + 1}
          </span>
          <span className="pt-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-xs">
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function LoginPage() {
  const [idpUrl, setIdpUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig().then((c) => setIdpUrl(c.idpInitiatedLoginUrl));
  }, []);

  return (
    <main className="min-h-svh bg-muted/40 px-4 py-12">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">SAML SSO Demo</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Auth0 is the Identity Provider (IdP). This app is the Service Provider (SP). Pick a
            flow to see where login starts.
          </p>
        </header>

        {hasError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Login failed</AlertTitle>
            <AlertDescription>
              The SAML response was rejected. The reason is in the server log.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <FlowBadge flow="sp-initiated" />
              <CardTitle>Start at our app</CardTitle>
              <CardDescription>The standard "Login with SSO" button.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <Steps flow="sp-initiated" />
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full">
                <a href="/saml/login">
                  Login with SSO <ArrowRight />
                </a>
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <FlowBadge flow="idp-initiated" />
              <CardTitle>Start at Auth0</CardTitle>
              <CardDescription>Begins outside our app, at the Identity Provider.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <Steps flow="idp-initiated" />
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-2">
              <Button asChild variant="outline" className="w-full">
                <a href={idpUrl ?? undefined}>
                  Go to Auth0 <ExternalLink />
                </a>
              </Button>
              {idpUrl && (
                <p className="break-all text-center font-mono text-xs text-muted-foreground">
                  {idpUrl}
                </p>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </main>
  );
}
