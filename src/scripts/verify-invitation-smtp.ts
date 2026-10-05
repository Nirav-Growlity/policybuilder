import { loadEnvConfig } from "@next/env";
import { verifyPolicyCraftInvitationSmtp } from "../lib/policycraft-invitation-mail";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info() {}, error() {} });

async function main() {
  // Bound the whole diagnostic, including DNS resolution. It never sends email.
  const timeout = setTimeout(() => {
    console.error("SMTP verification timed out. No email was sent. Check DNS and network access.");
    process.exit(1);
  }, 25_000);

  try {
    await verifyPolicyCraftInvitationSmtp();
    console.log("SMTP connection, TLS and authentication passed. No email was sent; sender acceptance is not verified.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "SMTP verification failed.");
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

void main();
