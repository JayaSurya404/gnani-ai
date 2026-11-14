import { signIntegrationRequest } from "../src/lib/integrations/signing";
import crypto from "crypto";

async function main() {
  const secret = process.env.VOICENEXUS_SHARED_SECRET || "voicenexus-local-dev-secret-333";
  const path = "/api/v1/integrations/leadnexus";
  const payload = {
    schemaVersion: "1.0",
    event: "LEAD_HANDOFF_REQUESTED",
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    organization: {
      id: crypto.randomUUID(),
      name: "Audit Org",
      slug: "audit-org",
    },
    business: {
      id: crypto.randomUUID(),
      name: "Audit Business",
      slug: "audit-biz",
      phone: "+91 98401 23456",
    },
    lead: {
      id: crypto.randomUUID(),
      name: "Audit User",
      phone: "+919840123456",
      email: "audit@example.in",
      temperature: "HOT",
      status: "NEW",
      score: 80,
      source: "Audit",
      primaryInterest: "Rooftop Solar",
    },
  };

  const rawBody = JSON.stringify(payload);
  const signed = signIntegrationRequest({
    rawBody,
    secret,
    method: "POST",
    path,
  });

  console.log("Headers:", signed.headers);
  const res = await fetch(`http://localhost:3000${path}`, {
    method: "POST",
    headers: signed.headers,
    body: rawBody,
  });

  console.log("HTTP Status:", res.status);
  const body = await res.json();
  console.log("Response Body:", body);
}

main().catch(console.error);

