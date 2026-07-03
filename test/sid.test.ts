import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidSid } from "../src/sid.js";

test("isValidSid accepts a UUID v4 and rejects everything else", () => {
  assert.equal(isValidSid("de305d54-75b4-431b-adb2-eb6b9e546013"), true);
  assert.equal(isValidSid("DE305D54-75B4-431B-ADB2-EB6B9E546013"), true);

  assert.equal(isValidSid("de305d54-75b4-131b-adb2-eb6b9e546013"), false);
  assert.equal(isValidSid("de305d54-75b4-431b-cdb2-eb6b9e546013"), false);
  assert.equal(isValidSid("not-a-uuid"), false);
  assert.equal(isValidSid(""), false);
  assert.equal(isValidSid(undefined), false);
  assert.equal(isValidSid(["de305d54-75b4-431b-adb2-eb6b9e546013"]), false);
});
