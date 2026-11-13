import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAppointment, toIana } from "../src/appointment-time.ts";

const at = Date.parse;
const parse = (phrase: string, tzRaw: string, now: string) => parseAppointment({ phrase, tzRaw, nowMs: at(now) });

test("'next Tuesday at 2 PM Eastern' from a Sunday", () => {
  const r = parse("next Tuesday at 2 PM Eastern", "Eastern", "2026-06-14T10:30:00Z");
  assert.equal(at(r.startIso), at("2026-06-16T14:00:00-04:00"));
  assert.equal(at(r.endIso), at("2026-06-16T14:30:00-04:00"));
  assert.equal(r.timeZone, "America/New_York");
});

test("tomorrow at 9am Pacific", () => {
  assert.equal(at(parse("tomorrow at 9 am", "Pacific", "2026-07-06T18:00:00Z").startIso), at("2026-07-07T09:00:00-07:00"));
});

test("crosses the autumn DST change and lands in standard time", () => {
  assert.equal(at(parse("next Sunday at 2 PM", "Eastern", "2026-10-28T12:00:00Z").startIso), at("2026-11-01T14:00:00-05:00"));
});

test("a bare small hour means the afternoon", () => {
  assert.equal(at(parse("Friday at 3", "", "2026-07-06T12:00:00Z").startIso), at("2026-07-10T15:00:00-04:00"));
});

test("a stated date is not also read as the hour", () => {
  assert.equal(at(parse("July 20", "Eastern", "2026-07-06T12:00:00Z").startIso), at("2026-07-20T15:00:00-04:00"));
  assert.equal(at(parse("7/20 at 10am", "Eastern", "2026-07-06T12:00:00Z").startIso), at("2026-07-20T10:00:00-04:00"));
  assert.equal(at(parse("in 1 day", "Eastern", "2026-07-06T12:00:00Z").startIso), at("2026-07-07T15:00:00-04:00"));
});

test("no phrase falls back to the next business day at 3 PM, in the future", () => {
  const r = parse("", "", "2026-07-03T22:00:00Z"); // Friday evening
  assert.equal(at(r.startIso), at("2026-07-06T15:00:00-04:00"));
});

test("never returns a time in the past", () => {
  assert.ok(at(parse("today at 9 am", "Eastern", "2026-07-06T20:00:00Z").startIso) > at("2026-07-06T20:00:00Z"));
});

test("anchored is true only when a day or a time was actually stated", () => {
  const anchored = (p: string) => parse(p, "Eastern", "2026-07-06T12:00:00Z").anchored;
  for (const p of ["next Tuesday at 2 PM", "tomorrow", "Friday", "at 3", "2:30 pm", "in 3 days", "July 20"]) assert.equal(anchored(p), true, p);
  for (const p of ["", "   ", "not specified", "whenever works"]) assert.equal(anchored(p), false, p);
});

test("timezone words map to zones without false hits inside other words", () => {
  assert.equal(toIana("PST"), "America/Los_Angeles");
  assert.equal(toIana("central time"), "America/Chicago");
  assert.equal(toIana("Arizona"), "America/Phoenix");
  assert.equal(toIana("America/Denver"), "America/Denver");
  assert.equal(toIana("September 3"), "America/New_York"); // "pt" inside a word is not Pacific
  assert.equal(toIana("October 5"), "America/New_York");   // nor is "ct" Central
});
