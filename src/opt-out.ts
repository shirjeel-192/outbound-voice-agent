// Opt-outs and the suppression list.
//
// Every channel feeds one list. A spoken opt-out on a call, a STOP reply, an unsubscribe click, a
// hard bounce and a spam complaint all add an entry, and both the dialler and the email sender
// check it before every contact.

// ---- reading a reply ----

// Only the NEW text of a reply counts. Our own footer says "reply STOP", so scanning the quoted
// original would opt out everyone who replied at all.
const QUOTE_STARTS = [/^On .*wrote:$/im, /^-----\s*Original Message\s*-----/im, /^_{5,}$/m];

export function topReplyText(raw: string): string {
  let cut = raw.length;
  for (const re of QUOTE_STARTS) {
    const m = re.exec(raw);
    if (m && m.index < cut) cut = m.index;
  }
  const lines = raw.slice(0, cut).split(/\r?\n/);
  while (lines.length && /^\s*>/.test(lines[lines.length - 1])) lines.pop();
  return lines.join("\n").trim();
}

const OPT_OUT = /\b(stop|unsubscribe|remove me|opt[\s-]?out|take me off|no more emails?|do not (?:email|contact) me)\b/i;

export function isOptOut(text: string): boolean {
  return OPT_OUT.test(text);
}

// ---- the list ----

export type Channel = "call" | "email" | "all";

export interface Suppression { phone?: string; email?: string; channel: Channel; reason: string }

export type EmailEvent =
  | { type: "bounce"; email: string; permanent: boolean }
  | { type: "complaint"; email: string }
  | { type: "unsubscribe"; email: string }
  | { type: "reply"; email: string; subject: string; text: string };

/** The suppression an email-provider event creates, or null when it creates none. */
export function suppressionFor(e: EmailEvent): Suppression | null {
  switch (e.type) {
    // A full mailbox is temporary. Only a permanent bounce takes the address out.
    case "bounce": return e.permanent ? { email: e.email, channel: "email", reason: "hard_bounce" } : null;
    case "complaint": return { email: e.email, channel: "email", reason: "complaint" };
    // An unsubscribe link is about email. It does not stop calls.
    case "unsubscribe": return { email: e.email, channel: "email", reason: "unsubscribe" };
    // A person who writes back "stop" means all of it.
    case "reply":
      return isOptOut(topReplyText(e.text)) || isOptOut(e.subject)
        ? { email: e.email, channel: "all", reason: "stop_reply" } : null;
  }
}

/** A spoken opt-out on a call stops everything, on every identifier we hold. */
export function callOptOut(contact: { phone?: string | null; email?: string | null }): Suppression {
  return { phone: contact.phone ?? undefined, email: contact.email ?? undefined, channel: "all", reason: "opt_out" };
}

/** Phones match exactly (E.164). Emails match case-insensitively. */
export function isSuppressed(list: Suppression[], contact: { phone?: string | null; email?: string | null }, channel: "call" | "email"): boolean {
  const email = contact.email?.toLowerCase();
  return list.some(s =>
    (s.channel === "all" || s.channel === channel) &&
    ((!!contact.phone && s.phone === contact.phone) || (!!email && s.email?.toLowerCase() === email)));
}
