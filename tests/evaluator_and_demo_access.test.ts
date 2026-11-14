import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { maskPhone, maskEmail, isEvaluatorEmail } from "../src/lib/permissions";

describe("Evaluator Access & Data Masking Suite", () => {
  it("1. correctly masks phone numbers with Indian country code", () => {
    assert.equal(maskPhone("+91 6382868845"), "+91 ******8845");
    assert.equal(maskPhone("+919840123456"), "+91 ******3456");
    assert.equal(maskPhone("+91 98401 23456"), "+91 ******3456");
  });

  it("2. correctly masks phone numbers without country code", () => {
    assert.equal(maskPhone("9840123456"), "******3456");
    assert.equal(maskPhone("6382868845"), "******8845");
  });

  it("3. handles edge-case phone inputs gracefully", () => {
    assert.equal(maskPhone(null), "");
    assert.equal(maskPhone(undefined), "");
    assert.equal(maskPhone(""), "");
    assert.equal(maskPhone("123"), "****");
  });

  it("4. correctly masks email addresses while preserving initial letter and domain TLD", () => {
    assert.equal(maskEmail("lakshmi.narayanan@example.com"), "l***@***.com");
    assert.equal(maskEmail("kavitha.ramesh@gmail.com"), "k***@***.com");
    assert.equal(maskEmail("admin@kaverisolar.in"), "a***@***.in");
    assert.equal(maskEmail(null), "");
    assert.equal(maskEmail(""), "");
  });

  it("5. strictly identifies preview evaluator email case-insensitively", () => {
    assert.equal(isEvaluatorEmail("preview@voicenexus.ai"), true);
    assert.equal(isEvaluatorEmail("PREVIEW@VOICENEXUS.AI"), true);
    assert.equal(isEvaluatorEmail("  preview@voicenexus.ai  "), true);
    assert.equal(isEvaluatorEmail("admin@kaverisolar.in"), false);
    assert.equal(isEvaluatorEmail("user@example.com"), false);
    assert.equal(isEvaluatorEmail(null), false);
  });

  it("6. guarantees demo access credentials safety invariants", () => {
    const evaluatorEmail = process.env.DEMO_EVALUATOR_EMAIL || "preview@voicenexus.ai";
    assert.equal(isEvaluatorEmail(evaluatorEmail), true);
    assert.notEqual(evaluatorEmail, "admin@kaverisolar.in");
  });
});
