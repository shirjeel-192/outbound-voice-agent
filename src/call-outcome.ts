import { reachedLiveHuman } from "./live-human.ts";
import { parseAppointment, type Appointment } from "./appointment-time.ts";

// After every call a post-call analysis model labels it: the outcome, whether a human spoke, any
// email address heard, the time the contact asked for. This module decides what the server
// actually does with those labels. No label is trusted alone.
//
//   - A warm outcome needs a live human. Otherwise it becomes no_contact.
//   - A booking needs a live human AND a time the contact actually stated. Otherwise it becomes
//     an information request, which starts the email follow-up they asked for.
//   - A captured email needs a live human AND a valid address. A machine cannot give us an email.
//   - A callback alert to the sales team needs a decision maker who engaged. A receptionist saying
//     "she's in 8 to 4:30" is a callback by definition, and it gets re-dialled, not escalated.

export type Outcome =
  | "book_followup_requested" | "callback_requested" | "info_requested"
  | "not_interested" | "opt_out" | "no_contact";

const WARM = new Set(["book_followup_requested", "callback_requested", "not_interested", "info_requested"]);

export interface CallReport {
  endedReason?: string | null;
  transcript?: string | null;
  startedAtMs: number;
  /** What the analysis model returned. Field types are not guaranteed. */
  labels: {
    outcome?: unknown;
    reachedLiveHuman?: unknown;
    email?: unknown;
    preferredTime?: unknown;
    timeZone?: unknown;
    decisionMakerEngaged?: unknown;
  };
}

export interface Lead { timeZone: string; email?: string | null }

export interface Decision {
  outcome: string;
  humanReached: boolean;
  /** An address heard on the call that passed both gates, or null. */
  capturedEmail: string | null;
  /** Set only for a real booking. The caller creates a pending meeting for a human to confirm. */
  meeting: Appointment | null;
  /** Ask a human on the team to pick this up, and why. */
  alert: "callback" | "no_email" | null;
  /** Add the lead to the suppression list on every channel. */
  suppress: boolean;
  /** Start the email follow-up sequence to this address. The caller still checks the suppression list. */
  followUpTo: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Conservative on purpose. A false accept poisons the lead and bounces against our sending domain. */
export function isEmailAddress(s: string | null | undefined): boolean {
  return !!s && EMAIL_RE.test(s.trim());
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function decide(report: CallReport, lead: Lead): Decision {
  const { labels } = report;
  const humanReached = reachedLiveHuman({
    endedReason: report.endedReason, transcript: report.transcript, modelSaysHuman: labels.reachedLiveHuman,
  });

  const heard = str(labels.email).toLowerCase();
  const capturedEmail = humanReached && isEmailAddress(heard) ? heard : null;
  const email = capturedEmail || lead.email || null;

  let outcome = str(labels.outcome);
  // opt_out is deliberately not in WARM. Honouring a "stop" heard on a machine costs nothing.
  if (WARM.has(outcome) && !humanReached) outcome = "no_contact";

  let meeting: Appointment | null = null;
  if (outcome === "book_followup_requested") {
    const appt = parseAppointment({
      phrase: str(labels.preferredTime), tzRaw: str(labels.timeZone) || lead.timeZone, nowMs: report.startedAtMs,
    });
    if (appt.anchored) meeting = appt;
    else outcome = "info_requested";
  }

  const d: Decision = { outcome, humanReached, capturedEmail, meeting, alert: null, suppress: false, followUpTo: null };
  if (outcome === "opt_out") d.suppress = true;
  else if (meeting) { /* booking: a human confirms it, nothing else fires */ }
  else if (outcome === "callback_requested") {
    // String() because the analysis model serialises booleans inconsistently. Absent means no.
    if (String(labels.decisionMakerEngaged) === "true") d.alert = "callback";
  }
  else if (outcome === "info_requested" && !email) d.alert = "no_email";
  else if (email) d.followUpTo = email;
  return d;
}
