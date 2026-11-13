// Wall-clock helpers built on Intl, so the repository has no runtime dependencies.

export interface LocalParts {
  year: number; month: number; day: number;
  hour: number; minute: number;
  weekday: number; // ISO: 1 = Monday ... 7 = Sunday
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function isValidTimeZone(timeZone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone }); return true; } catch { return false; }
}

/** What a wall clock in `timeZone` reads at instant `ms`. Throws on an unknown zone. */
export function localParts(ms: number, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, weekday: WEEKDAY[p.weekday] };
}

function offsetMinutes(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((wall - Math.floor(ms / 60_000) * 60_000) / 60_000);
}

/** The instant at which the wall clock in `timeZone` reads this date and time. DST-aware. */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMinutes(guess, timeZone) * 60_000;
  // Second pass: near a DST change the offset at the guess can differ from the offset at the answer.
  return guess - offsetMinutes(first, timeZone) * 60_000;
}
