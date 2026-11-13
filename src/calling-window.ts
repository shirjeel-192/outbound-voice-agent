import { localParts, isValidTimeZone } from "./local-time.ts";

// When may we ring this lead? Everything is evaluated in the LEAD's local time. At 05:00 UTC on a
// Monday it is still Sunday evening in Honolulu.

/** Legal calling hours in the called party's local time. A campaign window can be narrower, never wider. */
export const LEGAL_WINDOW = { start: "08:00", end: "20:00" };

/** ISO weekdays, 1 = Monday ... 7 = Sunday. Offices are shut at the weekend, so prospecting is weekday-only by default. */
export const WEEKDAYS = [1, 2, 3, 4, 5];

export interface CampaignWindow {
  start: string; // "HH:MM", inclusive
  end: string;   // "HH:MM", exclusive
  days: number[];
}

export interface DialTarget {
  /** IANA zone, or null when we could not work it out. Unknown means do not dial. */
  timeZone: string | null;
  /** The contact asked us to call back. Their chosen time beats the campaign's window and days. */
  callback?: boolean;
}

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const within = (mins: number, w: { start: string; end: string }) => mins >= minutes(w.start) && mins < minutes(w.end);

export function canDial(lead: DialTarget, campaign: CampaignWindow, nowMs: number = Date.now()): boolean {
  if (!lead.timeZone || !isValidTimeZone(lead.timeZone)) return false;
  const local = localParts(nowMs, lead.timeZone);
  const mins = local.hour * 60 + local.minute;
  if (!within(mins, LEGAL_WINDOW)) return false;
  // A callback is a promise to a person at a time they chose. If they asked for Saturday, we call Saturday.
  if (lead.callback) return true;
  return within(mins, campaign) && campaign.days.includes(local.weekday);
}
