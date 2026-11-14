import test from "node:test";
import assert from "node:assert/strict";
import { verifyTwilioWebhook } from "../src/lib/telephony/webhook-auth";
import twilio from "twilio";

test("Telephony Webhook Auth: Signature verification guard", async (t) => {
  const authToken = "1234567890abcdef1234567890abcdef";
  const url = "https://voicenexus.app/api/telephony/status";
  const params = {
    CallSid: "CA1234567890abcdef1234567890abcdef",
    CallStatus: "completed",
    Duration: "42",
  };

  await t.test("rejects when TWILIO_AUTH_TOKEN is missing", () => {
    const res = verifyTwilioWebhook({
      authToken: "",
      url,
      signature: "some-sig",
      params,
      skipInDevelopment: false,
    });
    assert.equal(res.isValid, false);
    assert.match(res.reason || "", /not configured/i);
  });

  await t.test("rejects when X-Twilio-Signature header is missing", () => {
    const res = verifyTwilioWebhook({
      authToken,
      url,
      signature: null,
      params,
      skipInDevelopment: false,
    });
    assert.equal(res.isValid, false);
    assert.match(res.reason || "", /Missing X-Twilio-Signature/i);
  });

  await t.test("rejects when signature does not match payload", () => {
    const res = verifyTwilioWebhook({
      authToken,
      url,
      signature: "invalid-signature",
      params,
      skipInDevelopment: false,
    });
    assert.equal(res.isValid, false);
    assert.match(res.reason || "", /validation failed/i);
  });

  await t.test("accepts valid Twilio signature generated with exact HMAC", () => {
    // Generate true Twilio HMAC signature using SDK
    const validSignature = twilio.getExpectedTwilioSignature(authToken, url, params);

    const res = verifyTwilioWebhook({
      authToken,
      url,
      signature: validSignature,
      params,
      skipInDevelopment: false,
    });

    assert.equal(res.isValid, true);
    assert.equal(res.reason, undefined);
  });

  await t.test("detects tampered payload parameters against valid signature", () => {
    const validSignature = twilio.getExpectedTwilioSignature(authToken, url, params);

    // Tamper with CallStatus parameter
    const tamperedParams = { ...params, CallStatus: "ringing" };

    const res = verifyTwilioWebhook({
      authToken,
      url,
      signature: validSignature,
      params: tamperedParams,
      skipInDevelopment: false,
    });

    assert.equal(res.isValid, false);
  });
});

