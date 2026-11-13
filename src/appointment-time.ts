import { localParts, zonedTime, isValidTimeZone } from "./local-time.ts";

// Turn a spoken time phrase ("next Tuesday at 2 PM Eastern") into a concrete meeting slot.
//
// It always returns a usable future slot, falling back to the next business day at 15:00. That is
// fine for scheduling a re-dial. It is NOT fine for telling a sales team "a meeting is booked", so
// the result carries `anchored`. It is false when the phrase held neither a day nor a time and
// every part of the slot came from the defaults. Callers that turn the slot into a commitment to a
// human must refuse when it is false.

const MEETING_MINUTES = 30;
const DEFAULT_HOUR = 15;
const DEFAULT_TZ = "America/New_York";

export function toIana(s: string): string {
  if (s.includes("/") && isValidTimeZone(s)) return s;
  const t = s.toLowerCase();
  if (/\b(pacific|p[ds]?t|los angeles|california)\b/.test(t)) return "America/Los_Angeles";
  if (/\b(arizona|phoenix)\b/.test(t)) return "America/Phoenix";
  if (/\b(mountain|m[ds]?t|denver)\b/.test(t)) return "America/Denver";
  if (/\b(central|c[ds]?t|chicago|texas)\b/.test(t)) return "America/Chicago";
  if (/\b(eastern|e[ds]?t|new york)\b/.test(t)) return "America/New_York";
  return DEFAULT_TZ;
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

type Day = { year: number; month: number; day: number };
const addDays = (d: Day, n: number): Day => {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
};
const isoWeekday = (d: Day) => new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() || 7;
const key = (d: Day) => d.year * 10_000 + d.month * 100 + d.day;

export interface Appointment { startIso: string; endIso: string; timeZone: string; anchored: boolean }

export function parseAppointment(input: { phrase: string; tzRaw: string; nowMs: number }): Appointment {
  const timeZone = toIana(input.tzRaw || input.phrase || "");
  const now = localParts(input.nowMs, timeZone);
  const today: Day = { year: now.year, month: now.month, day: now.day };
  const p = (input.phrase || "").toLowerCase();

  // ---- day ----
  let day = today;
  let dayAnchored = false;
  let weekdayAnchored = false;
  const inN = p.match(/\bin\s+(\d+)\s+days?\b/);
  const wd = WEEKDAYS.find(w => p.includes(w));
  const explicit = p.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/)
    ?? p.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (/\btomorrow\b/.test(p)) { day = addDays(today, 1); dayAnchored = true; }
  else if (/\btoday\b/.test(p)) { dayAnchored = true; }
  else if (inN) { day = addDays(today, Number(inN[1])); dayAnchored = true; }
  else if (wd) {
    // "Tuesday" said on a Tuesday means a week out.
    const ahead = (WEEKDAYS.indexOf(wd) + 1 - now.weekday + 7) % 7 || 7;
    day = addDays(today, ahead); dayAnchored = true; weekdayAnchored = true;
  } else if (explicit) {
    const m = /^\d/.test(explicit[1]) ? Number(explicit[1]) : MONTHS.indexOf(explicit[1]) + 1;
    day = { year: now.year, month: m, day: Number(explicit[2]) };
    if (key(day) < key(today)) day.year += 1;
    dayAnchored = true;
  }
  if (!dayAnchored) { // default: next business day
    day = addDays(today, 1);
    while (isoWeekday(day) > 5) day = addDays(day, 1);
  }

  // ---- time ----
  let hour = DEFAULT_HOUR, minute = 0;
  let timeAnchored = false;
  // Drop any date first so "July 20" or "6/16" is not also read as 20:00 or 18:00.
  const timeText = explicit ? p.replace(explicit[0], " ") : p;
  const tm = timeText.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b(?!\s*days?\b)/);
  if (tm && Number(tm[1]) >= 1 && Number(tm[1]) <= 23) {
    timeAnchored = true;
    hour = Number(tm[1]); minute = tm[2] ? Number(tm[2]) : 0;
    const ap = tm[3]?.replace(/\./g, "");
    if (ap === "pm" && hour < 12) hour += 12;
    else if (ap === "am" && hour === 12) hour = 0;
    else if (!ap && hour <= 7) hour += 12; // "at 3" during business hours means 15:00
  }

  // ---- always in the future ----
  const at = (d: Day) => zonedTime(d.year, d.month, d.day, hour, minute, timeZone);
  let start = at(day);
  if (start <= input.nowMs) { day = addDays(day, weekdayAnchored ? 7 : 1); start = at(day); }
  while (start <= input.nowMs) { day = addDays(day, 1); start = at(day); }

  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(start + MEETING_MINUTES * 60_000).toISOString(),
    timeZone,
    anchored: dayAnchored || timeAnchored,
  };
}
