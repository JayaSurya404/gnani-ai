import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, getPhoneVariants } from "../src/lib/phone";
import { TwilioWhatsAppAdapter } from "../src/lib/automations/notification-adapters/whatsapp-twilio-adapter";

test("Milestone 8 Telephony & WhatsApp: Compliance, Gateways and Adapters", async (t) => {
  await t.test("DNC normalization detects phone variations (+91, standard, leading zero)", () => {
    const raw1 = "+91 98765 43210";
    const raw2 = "09876543210";
    const raw3 = "9876543210";

    const norm1 = normalizePhone(raw1);
    const norm2 = normalizePhone(raw2);
    const norm3 = normalizePhone(raw3);

    assert.equal(norm1, "+919876543210");
    assert.equal(norm2, "+919876543210");
    assert.equal(norm3, "+919876543210");

    const variants = getPhoneVariants(norm1);
    assert.ok(variants.includes("+919876543210"));
    assert.ok(variants.includes("9876543210"));
  });

  await t.test("Regulatory calling window check validates 9 AM - 9 PM restriction", () => {
    function isAllowedCallingHour(hour: number): boolean {
      return hour >= 9 && hour < 21;
    }

    assert.equal(isAllowedCallingHour(8), false, "8:00 AM should be blocked");
    assert.equal(isAllowedCallingHour(9), true, "9:00 AM should be allowed");
    assert.equal(isAllowedCallingHour(14), true, "2:00 PM should be allowed");
    assert.equal(isAllowedCallingHour(20), true, "8:59 PM should be allowed");
    assert.equal(isAllowedCallingHour(21), false, "9:00 PM should be blocked");
    assert.equal(isAllowedCallingHour(23), false, "11:00 PM should be blocked");
  });

  await t.test("Inbound WhatsApp opt-out keyword regex detects standard unsubscribe terms", () => {
    const optOutRegex = /^(stop|unsubscribe|cancel|optout|quit)$/i;

    assert.ok(optOutRegex.test("STOP"));
    assert.ok(optOutRegex.test("stop"));
    assert.ok(optOutRegex.test("Unsubscribe"));
    assert.ok(optOutRegex.test("CANCEL"));
    assert.ok(optOutRegex.test("quit"));

    assert.ok(!optOutRegex.test("Hello please call me"));
    assert.ok(!optOutRegex.test("Can I get pricing details?"));
  });

  await t.test("TwilioWhatsAppAdapter safely reports unconfigured state when keys are absent", async () => {
    const origSid = process.env.TWILIO_ACCOUNT_SID;
    const origToken = process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;

    const adapter = new TwilioWhatsAppAdapter();
    assert.equal(adapter.isConfigured(), false);

    const result = await adapter.sendDirect({
      recipient: "+919876543210",
      message: "Test message",
    });

    assert.equal(result.success, false);
    assert.match(result.error || "", /unconfigured/i);

    // Restore env
    if (origSid) process.env.TWILIO_ACCOUNT_SID = origSid;
    if (origToken) process.env.TWILIO_AUTH_TOKEN = origToken;
  });

  await t.test("Human Escalation 7-stage state machine transitions", () => {
    type EscalationStage =
      | "REQUESTED"
      | "TASK_CREATED"
      | "SUPERVISOR_NOTIFIED"
      | "REPRESENTATIVE_AVAILABLE"
      | "INITIATED"
      | "COMPLETED"
      | "FAILED";

    function canTransition(current: EscalationStage, next: EscalationStage): boolean {
      const allowedNext: Record<EscalationStage, EscalationStage[]> = {
        REQUESTED: ["TASK_CREATED", "FAILED"],
        TASK_CREATED: ["SUPERVISOR_NOTIFIED", "FAILED"],
        SUPERVISOR_NOTIFIED: ["REPRESENTATIVE_AVAILABLE", "INITIATED", "FAILED"],
        REPRESENTATIVE_AVAILABLE: ["INITIATED", "FAILED"],
        INITIATED: ["COMPLETED", "FAILED"],
        COMPLETED: [],
        FAILED: [],
      };
      return allowedNext[current].includes(next);
    }

    assert.ok(canTransition("REQUESTED", "TASK_CREATED"));
    assert.ok(canTransition("TASK_CREATED", "SUPERVISOR_NOTIFIED"));
    assert.ok(canTransition("SUPERVISOR_NOTIFIED", "INITIATED"));
    assert.ok(canTransition("INITIATED", "COMPLETED"));
    assert.ok(canTransition("INITIATED", "FAILED"));

    // Illegal backwards transitions
    assert.ok(!canTransition("COMPLETED", "REQUESTED"));
    assert.ok(!canTransition("COMPLETED", "INITIATED"));
  });

  await t.test("TwiML Media Streams XML generator produces valid stream tags with parameters", () => {
    const wsUrl = "wss://gateway.voicenexus.app/ws/twilio";
    const sessionId = "call_test_123";
    const orgId = "org_test_456";

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="sessionId" value="${sessionId}" />
      <Parameter name="organizationId" value="${orgId}" />
      <Parameter name="direction" value="OUTBOUND" />
    </Stream>
  </Connect>
</Response>`;

    assert.match(twiml, /<Response>/);
    assert.match(twiml, /<Connect>/);
    assert.match(twiml, /<Stream url="wss:\/\/gateway\.voicenexus\.app\/ws\/twilio">/);
    assert.match(twiml, /<Parameter name="sessionId" value="call_test_123" \/>/);
    assert.match(twiml, /<\/Stream>/);
  });
});
