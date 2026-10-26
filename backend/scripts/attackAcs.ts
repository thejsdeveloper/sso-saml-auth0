// Dev tool: re-sends a captured SAMLResponse to our ACS to show the validation
// rejects replays and tampering. Run it while the server is running, then read
// the "[saml] login rejected: ..." line in the server log.
//
// Capture: DevTools > Network (Preserve log on) > POST /saml/acs > Payload >
// copy the SAMLResponse value (parsed view, i.e. base64) into a file.
//
// Usage:
//   node scripts/attackAcs.ts <file> replay               # send it again as-is
//   node scripts/attackAcs.ts <file> strip-in-response-to  # make an SP-initiated response look unsolicited
//   node scripts/attackAcs.ts <file> tamper-email          # change the signed email
import { readFileSync } from "node:fs";

const [file, mode = "replay"] = process.argv.slice(2);
if (!file) {
  console.error("usage: node scripts/attackAcs.ts <file> [replay|strip-in-response-to|tamper-email]");
  process.exit(1);
}

const acsUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/saml/acs`;
let xml = Buffer.from(readFileSync(file, "utf8").trim(), "base64").toString("utf8");

switch (mode) {
  case "replay":
    break;
  case "strip-in-response-to":
    // Removes the outer, unsigned InResponseTo only, so the assertion signature
    // stays valid. The signed copy inside SubjectConfirmationData can't be
    // removed, which is exactly what assertionValidator.ts checks.
    xml = xml.replace(/(<samlp:Response[^>]*?)\sInResponseTo="[^"]*"/, "$1");
    break;
  case "tamper-email":
    xml = xml.replace(
      /(emailaddress"[^>]*>\s*<saml:AttributeValue[^>]*>)[^<]*/,
      "$1attacker@evil.com",
    );
    break;
  default:
    console.error(`unknown mode: ${mode}`);
    process.exit(1);
}

const res = await fetch(acsUrl, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ SAMLResponse: Buffer.from(xml).toString("base64") }),
  redirect: "manual",
});

const location = res.headers.get("location") ?? "";
console.log(`[${mode}] ${res.status} -> ${location}`);
console.log(location.includes("error=") ? "REJECTED (good). See server log for the reason." : "ACCEPTED (bad!)");
