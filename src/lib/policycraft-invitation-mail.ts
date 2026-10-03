export async function sendPolicyCraftManagerInvitation(email: string, name: string, invitationUrl: string): Promise<void> {
  const apiKey = process.env.ZEPTOMAIL_API_KEY?.trim();
  const fromAddress = process.env.ZEPTOMAIL_FROM_ADDRESS?.trim();
  const fromName = process.env.ZEPTOMAIL_FROM_NAME?.trim();
  const configuredApiUrl = process.env.ZEPTOMAIL_API_URL?.trim();
  if (!apiKey || !fromAddress || !fromName || !configuredApiUrl) {
    throw new Error("ZeptoMail is not configured. Set ZEPTOMAIL_API_URL, ZEPTOMAIL_API_KEY, ZEPTOMAIL_FROM_ADDRESS, and ZEPTOMAIL_FROM_NAME.");
  }

  let apiUrl: URL;
  try {
    apiUrl = new URL(configuredApiUrl);
    if (apiUrl.protocol !== "https:") throw new Error();
  } catch {
    throw new Error("ZEPTOMAIL_API_URL must be an HTTPS endpoint.");
  }
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Zoho-enczapikey ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { address: fromAddress, name: fromName },
      to: [{ email_address: { address: email, name } }],
      subject: "Your PolicyCraft manager invitation",
      textbody: `Hello ${name},\n\nYou have been invited to manage policies in PolicyCraft. Accept your invitation within 72 hours:\n${invitationUrl}\n\nIf you were not expecting this message, you can ignore it.`,
      htmlbody: `<p>Hello ${escapeHtml(name)},</p><p>You have been invited to manage policies in PolicyCraft.</p><p><a href="${escapeHtml(invitationUrl)}">Accept invitation</a></p><p>This invitation expires in 72 hours. If you were not expecting this message, you can ignore it.</p>`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`ZeptoMail rejected the invitation (${response.status}).`);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}
