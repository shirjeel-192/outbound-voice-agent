import { test } from "node:test";
import assert from "node:assert/strict";
import { pickVariant, assignVariant } from "../src/variants.ts";

const ab = [{ id: "a", weight: 1 }, { id: "b", weight: 3 }];

test("returns null when there is nothing to pick", () => {
  assert.equal(pickVariant([]), null);
  assert.equal(pickVariant([{ id: "a", weight: 0 }]), null);
});

test("respects weights", () => {
  assert.equal(pickVariant(ab, () => 0.1), "a");
  assert.equal(pickVariant(ab, () => 0.5), "b");
  assert.equal(pickVariant(ab, () => 0.99), "b");
});

test("skips zero-weight variants", () => {
  assert.equal(pickVariant([{ id: "a", weight: 0 }, { id: "b", weight: 1 }], () => 0), "b");
});

test("assignment is sticky", () => {
  assert.equal(assignVariant(null, ab, () => 0.1), "a");
  assert.equal(assignVariant("b", ab, () => 0.1), "b");
  assert.equal(assignVariant("b", [], () => 0.1), "b");
});
