import { test } from "node:test";
import assert from "node:assert/strict";
import { canDial, WEEKDAYS } from "../src/calling-window.ts";
import { timezoneForPhone, ALL_ZONES } from "../src/area-code-timezone.ts";
import { isValidTimeZone } from "../src/local-time.ts";

const at = Date.parse;
const ET = "America/New_York";
const campaign = { start: "09:00", end: "17:00", days: WEEKDAYS };

test("evaluates the window in the lead's own zone", () => {
  // Monday 18:00 UTC is 14:00 in New York and 11:00 in Los Angeles.
  assert.equal(canDial({ timeZone: ET }, campaign, at("2026-07-06T18:00:00Z")), true);
  assert.equal(canDial({ timeZone: "America/Los_Angeles" }, campaign, at("2026-07-06T18:00:00Z")), true);
  // Monday 15:00 UTC is 08:00 in Los Angeles, before the campaign opens.
  assert.equal(canDial({ timeZone: "America/Los_Angeles" }, campaign, at("2026-07-06T15:00:00Z")), false);
});

test("the end of the window is exclusive", () => {
  assert.equal(canDial({ timeZone: ET }, campaign, at("2026-07-06T20:59:00Z")), true);
  assert.equal(canDial({ timeZone: ET }, campaign, at("2026-07-06T21:00:00Z")), false);
});

test("prospecting is weekday-only, judged by the lead's local day", () => {
  assert.equal(canDial({ timeZone: ET }, campaign, at("2026-07-04T16:00:00Z")), false); // Saturday
  // Monday 03:00 UTC is still Sunday 17:00 in Honolulu.
  const honolulu = { timeZone: "Pacific/Honolulu" };
  const lateWindow = { start: "09:00", end: "19:00", days: WEEKDAYS };
  assert.equal(canDial(honolulu, lateWindow, at("2026-07-06T03:00:00Z")), false);
  assert.equal(canDial(honolulu, { ...lateWindow, days: [1, 2, 3, 4, 5, 6, 7] }, at("2026-07-06T03:00:00Z")), true);
});

test("a callback ignores the campaign window and days but never the legal hours", () => {
  const callback = { timeZone: ET, callback: true };
  assert.equal(canDial(callback, campaign, at("2026-07-04T16:00:00Z")), true);  // Saturday 12:00
  assert.equal(canDial(callback, campaign, at("2026-07-06T23:30:00Z")), true);  // Monday 19:30
  assert.equal(canDial(callback, campaign, at("2026-07-07T00:00:00Z")), false); // Monday 20:00
  assert.equal(canDial(callback, campaign, at("2026-07-06T11:59:00Z")), false); // Monday 07:59
});

test("a campaign window wider than the legal hours is clamped", () => {
  const wide = { start: "06:00", end: "23:00", days: WEEKDAYS };
  assert.equal(canDial({ timeZone: ET }, wide, at("2026-07-06T11:00:00Z")), false); // 07:00 local
  assert.equal(canDial({ timeZone: ET }, wide, at("2026-07-07T01:00:00Z")), false); // 21:00 local
});

test("an unknown or invalid zone never dials", () => {
  assert.equal(canDial({ timeZone: null }, campaign, at("2026-07-06T18:00:00Z")), false);
  assert.equal(canDial({ timeZone: "Mars/Olympus" }, campaign, at("2026-07-06T18:00:00Z")), false);
});

const num = (area: string) => `+1${area}5550100`;

test("area code to zone, including the multi-hour cases", () => {
  assert.equal(timezoneForPhone(num("212")), "America/New_York");
  assert.equal(timezoneForPhone(num("312")), "America/Chicago");
  assert.equal(timezoneForPhone(num("303")), "America/Denver");
  assert.equal(timezoneForPhone(num("415")), "America/Los_Angeles");
  assert.equal(timezoneForPhone(num("808")), "Pacific/Honolulu");
  assert.equal(timezoneForPhone(num("907")), "America/Anchorage");
});

test("Arizona is Phoenix, not Mountain, because it skips DST", () => {
  for (const area of ["480", "520", "602", "623", "928"]) assert.equal(timezoneForPhone(num(area)), "America/Phoenix");
});

test("returns null rather than guessing", () => {
  for (const n of [num("800"), num("900"), num("999"), "+44207", "5551234", "", null]) {
    assert.equal(timezoneForPhone(n), null, String(n));
  }
});

test("every zone in the table is a real IANA zone", () => {
  assert.deepEqual(ALL_ZONES.filter(z => !isValidTimeZone(z)), []);
});
