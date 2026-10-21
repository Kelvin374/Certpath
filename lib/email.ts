/**
 * Outbound email.
 *
 * CertPath only needs to send one kind of message today — a password-reset
 * link — so the transport is kept behind a tiny interface. The default
 * implementation writes the message to the server log, which makes the reset
 * flow fully usable in development without a mail server.
 *
 * To send real mail, point `EMAIL_WEBHOOK_URL` at any service that accepts a
 * JSON POST, or implement `EmailAdapter` and register it in `getAdapter()`.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailAdapter {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Writes the message to the server log. Used when no provider is configured. */
export const consoleAdapter: EmailAdapter = {
  name: "console",
  async send(message) {
    // eslint-disable-next-line no-console
    console.info(
      `[certpath:email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
    );
  },
};

/**
 * Posts the message as JSON to an arbitrary HTTPS endpoint.
 *
 * Works with a wide range of transactional-email services that expose a REST
 * API, and keeps the project free of a mail-client dependency.
 */
export function webhookAdapter(url: string, headers: Record<string, string> = {}): EmailAdapter {
  return {
    name: "webhook",
    async send(message) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
      if (!res.ok) {
        throw new Error(`Email webhook responded ${res.status}`);
      }
    },
  };
}

let adapter: EmailAdapter | null = null;

/** The adapter in use, chosen once per process. */
export function getAdapter(): EmailAdapter {
  if (adapter) return adapter;

  const url = process.env.EMAIL_WEBHOOK_URL;
  if (url) {
    const headers: Record<string, string> = {};
    if (process.env.EMAIL_WEBHOOK_TOKEN) {
      headers.authorization = `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}`;
    }
    adapter = webhookAdapter(url, headers);
  } else {
    adapter = consoleAdapter;
  }

  return adapter;
}

/** Send a message, logging instead of throwing if the transport fails. */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  try {
    await getAdapter().send(message);
    return true;
  } catch (error) {
    // A failed email must never break the request that triggered it — the
    // token is still valid and the user can request another.
    // eslint-disable-next-line no-console
    console.error("[certpath:email] failed to send message:", error);
    return false;
  }
}

/** Build the password-reset message for an account. */
export function passwordResetMessage(email: string, resetUrl: string): EmailMessage {
  return {
    to: email,
    subject: "Reset your CertPath password",
    text: [
      "Someone asked to reset the password for this CertPath account.",
      "",
      `Open this link to choose a new password (valid for 1 hour):`,
      resetUrl,
      "",
      "If this wasn't you, you can ignore this message — nothing has changed.",
    ].join("\n"),
    html: [
      "<p>Someone asked to reset the password for this CertPath account.</p>",
      `<p><a href="${resetUrl}">Choose a new password</a> (valid for 1 hour).</p>`,
      "<p>If this wasn't you, you can ignore this message — nothing has changed.</p>",
    ].join(""),
  };
}
