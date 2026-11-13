import { test } from "node:test";
import assert from "node:assert/strict";
import { reachedLiveHuman, MACHINE_ENDED_REASONS } from "../src/live-human.ts";

test("a machine end reason vetoes the model, whatever it claims", () => {
  for (const endedReason of MACHINE_ENDED_REASONS) {
    assert.equal(reachedLiveHuman({
      endedReason, transcript: "User: Yes hello, how can I help you today?", modelSaysHuman: true,
    }), false, endedReason);
  }
});

test("the model saying no is final", () => {
  assert.equal(reachedLiveHuman({ endedReason: "customer-ended-call", modelSaysHuman: false }), false);
  assert.equal(reachedLiveHuman({ endedReason: "customer-ended-call", modelSaysHuman: "false" }), false);
});

test("menu or voicemail language blocks unless the model affirms a human", () => {
  const transcript = "User: Press 1 for scheduling. Our office hours are 8 AM to 5 PM.";
  assert.equal(reachedLiveHuman({ endedReason: "customer-ended-call", transcript }), false);
});

test("allows the menu-then-human case", () => {
  assert.equal(reachedLiveHuman({
    endedReason: "customer-ended-call",
    transcript: "User: Press 1 for the front desk.\nUser: Front desk, how can I help?",
    modelSaysHuman: "true",
  }), true);
});

test("allows a clean human conversation", () => {
  assert.equal(reachedLiveHuman({
    endedReason: "customer-ended-call", transcript: "User: Sure, what is this regarding?", modelSaysHuman: true,
  }), true);
});

test("a recording stating opening hours, ended on silence, is not a human", () => {
  assert.equal(reachedLiveHuman({
    endedReason: "silence-timeout",
    transcript: "User: Please call back Monday through Thursday, 9 AM to 4 PM.",
    modelSaysHuman: true,
  }), false);
});
