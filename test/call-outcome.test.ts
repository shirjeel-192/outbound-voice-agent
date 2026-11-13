import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, isEmailAddress, type CallReport } from "../src/call-outcome.ts";

const mail = (user: string) => `${user}@example.com`;
const lead = { timeZone: "America/New_York", email: null };
const human = "User: Sure, what is this about?";
const report = (labels: CallReport["labels"], extra: Partial<CallReport> = {}): CallReport => ({
  endedReason: "customer-ended-call", transcript: human, startedAtMs: Date.parse("2026-07-06T14:00:00Z"),
  labels: { reachedLiveHuman: true, ...labels }, ...extra,
});

test("a booking with a stated time is a booking", () => {
  const d = decide(report({ outcome: "book_followup_requested", preferredTime: "Thursday at 2 PM" }), lead);
  assert.equal(d.outcome, "book_followup_requested");
  assert.equal(Date.parse(d.meeting!.startIso), Date.parse("2026-07-09T14:00:00-04:00"));
  assert.equal(d.alert, null);
});

test("a booking with no stated time becomes an information request", () => {
  const d = decide(report({ outcome: "book_followup_requested", preferredTime: "" }), { ...lead, email: mail("office") });
  assert.equal(d.outcome, "info_requested");
  assert.equal(d.meeting, null);
  assert.equal(d.followUpTo, mail("office"));
});

test("a voicemail claiming a booking creates nothing", () => {
  const d = decide(report({ outcome: "book_followup_requested", preferredTime: "tomorrow at 2" }, { endedReason: "voicemail" }), lead);
  assert.equal(d.outcome, "no_contact");
  assert.equal(d.meeting, null);
  assert.equal(d.alert, null);
});

test("a phone menu claiming a callback sends no alert", () => {
  const d = decide(report(
    { outcome: "callback_requested", reachedLiveHuman: undefined, decisionMakerEngaged: true },
    { transcript: "User: Thank you for calling. Press 2 for billing." }), lead);
  assert.equal(d.outcome, "no_contact");
  assert.equal(d.alert, null);
});

test("callback alerts need a decision maker who engaged", () => {
  const alertFor = (decisionMakerEngaged: unknown) =>
    decide(report({ outcome: "callback_requested", decisionMakerEngaged }), lead).alert;
  assert.equal(alertFor(true), "callback");
  assert.equal(alertFor("true"), "callback"); // booleans sometimes arrive as strings
  assert.equal(alertFor(false), null);        // a receptionist gave a time to try again
  assert.equal(alertFor(undefined), null);    // absent fails closed
});

test("a valid address heard from a human is captured and used", () => {
  const d = decide(report({ outcome: "info_requested", email: ` ${mail("Office")} ` }), lead);
  assert.equal(d.capturedEmail, mail("office"));
  assert.equal(d.followUpTo, mail("office"));
});

test("a mangled address is rejected and a human is asked to get it", () => {
  const d = decide(report({ outcome: "info_requested", email: "front desk at example dot com" }), lead);
  assert.equal(d.capturedEmail, null);
  assert.equal(d.followUpTo, null);
  assert.equal(d.alert, "no_email");
});

test("an address 'heard' on a machine call is never captured", () => {
  const d = decide(report({ outcome: "info_requested", email: mail("office") }, { endedReason: "voicemail" }), lead);
  assert.equal(d.capturedEmail, null);
  assert.equal(d.outcome, "no_contact");
});

test("an opt-out suppresses and sends nothing", () => {
  const d = decide(report({ outcome: "opt_out" }), { ...lead, email: mail("office") });
  assert.equal(d.suppress, true);
  assert.equal(d.followUpTo, null);
  assert.equal(d.alert, null);
});

test("isEmailAddress is conservative", () => {
  assert.equal(isEmailAddress(mail("dr.lee")), true);
  for (const s of ["office@example", "office at example dot com", mail("two words"), "", null]) assert.equal(isEmailAddress(s), false, String(s));
});
