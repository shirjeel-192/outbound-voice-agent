import { test } from "node:test";
import assert from "node:assert/strict";
import { topReplyText, isOptOut, suppressionFor, callOptOut, isSuppressed, type Suppression } from "../src/opt-out.ts";

const mail = (user: string) => `${user}@example.com`;
const num = (area: string) => `+1${area}5550100`;

test("keeps only the new text above the quoted original", () => {
  assert.equal(topReplyText("STOP\n\nOn Mon, Jul 6, 2026 Sales Team wrote:\n> reply STOP to opt out"), "STOP");
  const outlook = topReplyText("please remove me\n-----Original Message-----\nreply STOP to opt out");
  assert.ok(outlook.includes("please remove me"));
  assert.ok(!outlook.includes("opt out"));
});

test("does not opt out on our own quoted footer", () => {
  assert.equal(isOptOut(topReplyText("Sounds good, thanks!\n\nOn Jul 6 Sales Team wrote:\n> You can also just reply STOP.")), false);
});

test("detects opt-out phrasings", () => {
  for (const t of ["STOP", "please unsubscribe", "remove me from your list", "take me off", "no more emails", "do not contact me"]) assert.equal(isOptOut(t), true, t);
  assert.equal(isOptOut("thanks, maybe next quarter"), false);
});

test("email events map to suppressions", () => {
  assert.equal(suppressionFor({ type: "bounce", email: mail("a"), permanent: false }), null);
  assert.deepEqual(suppressionFor({ type: "bounce", email: mail("a"), permanent: true }), { email: mail("a"), channel: "email", reason: "hard_bounce" });
  assert.equal(suppressionFor({ type: "complaint", email: mail("a") })?.channel, "email");
  assert.equal(suppressionFor({ type: "unsubscribe", email: mail("a") })?.channel, "email");
  assert.equal(suppressionFor({ type: "reply", email: mail("a"), subject: "Re: hello", text: "Stop calling us" })?.channel, "all");
  assert.equal(suppressionFor({ type: "reply", email: mail("a"), subject: "Re: hello", text: "Tell me more" }), null);
});

test("an unsubscribe stops email but not calls", () => {
  const list = [suppressionFor({ type: "unsubscribe", email: mail("a") })!];
  const contact = { phone: num("212"), email: mail("a") };
  assert.equal(isSuppressed(list, contact, "email"), true);
  assert.equal(isSuppressed(list, contact, "call"), false);
});

test("a STOP reply stops calls to the contact that address belongs to", () => {
  const list = [suppressionFor({ type: "reply", email: mail("a"), subject: "", text: "STOP" })!];
  assert.equal(isSuppressed(list, { phone: num("212"), email: mail("a") }, "call"), true);
});

test("a spoken opt-out stops everything, matched by phone or email", () => {
  const list: Suppression[] = [callOptOut({ phone: num("212"), email: mail("a") })];
  assert.equal(isSuppressed(list, { phone: num("212") }, "call"), true);
  assert.equal(isSuppressed(list, { email: mail("A").toUpperCase() }, "email"), true);
  assert.equal(isSuppressed(list, { phone: num("213"), email: mail("b") }, "call"), false);
});
