import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';
const SHARED_SECRET = process.env.VOICENEXUS_SHARED_SECRET || 'voicenexus-local-dev-secret-333';

function computeBodyDigest(rawBody) {
  return crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex');
}

function signRequest({ rawBody, secret, method, path, requestId, timestamp }) {
  const reqId = requestId || crypto.randomUUID();
  const ts = String(timestamp || Math.floor(Date.now() / 1000));
  const bodyDigest = computeBodyDigest(rawBody);
  const canonicalString = ['v1', ts, method.toUpperCase(), path, reqId, bodyDigest].join('\n');
  const signature = 'v1=' + crypto.createHmac('sha256', secret).update(canonicalString, 'utf8').digest('hex');

  return {
    headers: {
      'Content-Type': 'application/json',
      'x-integration-signature': signature,
      'x-integration-timestamp': ts,
      'x-integration-request-id': reqId,
    },
    reqId,
    ts,
  };
}

async function runContractAudit() {
  console.log('=== SECTION 3: INTEGRATION CONTRACT AUDIT ===');
  console.log('Testing endpoints against:', BASE_URL);

  const testPayload = {
    schemaVersion: '1.0',
    event: 'LEAD_HANDOFF_REQUESTED',
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    organization: {
      id: crypto.randomUUID(),
      name: 'Audit Energy Org',
      slug: 'audit-energy',
    },
    business: {
      id: crypto.randomUUID(),
      name: 'Audit Solar Business',
      slug: 'audit-solar',
      phone: '+91 98401 23456',
    },
    lead: {
      id: crypto.randomUUID(),
      name: 'Audit Customer',
      phone: '+919840123456',
      email: 'audit@example.in',
      temperature: 'HOT',
      status: 'NEW',
      score: 85,
      source: 'Audit Suite',
      primaryInterest: 'Solar Roof 5kW',
    },
  };

  const rawJson = JSON.stringify(testPayload);
  const path = '/api/v1/integrations/leadnexus';

  // Test 1: Missing signature
  console.log('\nTest 1: Missing signature header');
  const res1 = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawJson,
  });
  console.log(`Status: ${res1.status} (Expected 401)`);
  const data1 = await res1.json();
  console.log('Response:', data1);

  // Test 2: Tampered signature
  console.log('\nTest 2: Tampered / invalid signature');
  const { headers: validHeaders } = signRequest({
    rawBody: rawJson,
    secret: 'wrong-secret',
    method: 'POST',
    path,
  });
  const res2 = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: validHeaders,
    body: rawJson,
  });
  console.log(`Status: ${res2.status} (Expected 401)`);
  const data2 = await res2.json();
  console.log('Response:', data2);

  // Test 3: Expired timestamp (> 300 seconds in past)
  console.log('\nTest 3: Expired timestamp (>300s in past)');
  const expiredTs = Math.floor(Date.now() / 1000) - 350;
  const { headers: expiredHeaders } = signRequest({
    rawBody: rawJson,
    secret: SHARED_SECRET,
    method: 'POST',
    path,
    timestamp: expiredTs,
  });
  const res3 = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: expiredHeaders,
    body: rawJson,
  });
  console.log(`Status: ${res3.status} (Expected 401)`);
  const data3 = await res3.json();
  console.log('Response:', data3);

  // Test 4: Future timestamp (> 300 seconds in future)
  console.log('\nTest 4: Clock drift future timestamp (>300s)');
  const futureTs = Math.floor(Date.now() / 1000) + 350;
  const { headers: futureHeaders } = signRequest({
    rawBody: rawJson,
    secret: SHARED_SECRET,
    method: 'POST',
    path,
    timestamp: futureTs,
  });
  const res4 = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: futureHeaders,
    body: rawJson,
  });
  console.log(`Status: ${res4.status} (Expected 401)`);
  const data4 = await res4.json();
  console.log('Response:', data4);

  // Test 5: Replay attack (same request ID sent twice)
  console.log('\nTest 5: Replay attack prevention');
  const fixedRequestId = 'req-audit-' + crypto.randomUUID();
  const { headers: replayHeaders } = signRequest({
    rawBody: rawJson,
    secret: SHARED_SECRET,
    method: 'POST',
    path,
    requestId: fixedRequestId,
  });
  const res5a = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: replayHeaders,
    body: rawJson,
  });
  console.log(`First request status: ${res5a.status} (Expected 200 or 201)`);
  const data5a = await res5a.json();
  console.log('First response:', data5a);

  // Immediate second request with identical requestId
  const res5b = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: replayHeaders,
    body: rawJson,
  });
  console.log(`Second (replayed) request status: ${res5b.status} (Expected 401 - Replay detected)`);
  const data5b = await res5b.json();
  console.log('Second response:', data5b);

  // Test 6: Malformed JSON body
  console.log('\nTest 6: Malformed JSON body');
  const malformedBody = '{ "schemaVersion": "1.0", "event": ';
  const { headers: malformedHeaders } = signRequest({
    rawBody: malformedBody,
    secret: SHARED_SECRET,
    method: 'POST',
    path,
  });
  const res6 = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: malformedHeaders,
    body: malformedBody,
  });
  console.log(`Status: ${res6.status} (Expected 400)`);
  const data6 = await res6.json();
  console.log('Response:', data6);

  // Test 7: Schema validation failure (missing required fields)
  console.log('\nTest 7: Schema validation failure (invalid payload)');
  const invalidPayload = { schemaVersion: '1.0', event: 'UNKNOWN_EVENT' };
  const invalidJson = JSON.stringify(invalidPayload);
  const { headers: invalidHeaders } = signRequest({
    rawBody: invalidJson,
    secret: SHARED_SECRET,
    method: 'POST',
    path,
  });
  const res7 = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: invalidHeaders,
    body: invalidJson,
  });
  console.log(`Status: ${res7.status} (Expected 422)`);
  const data7 = await res7.json();
  console.log('Response:', data7);

  // Test 8: Reverse Sync Events Endpoint (/api/v1/integrations/leadnexus/events)
  console.log('\nTest 8: Reverse Sync Events Endpoint - missing signature');
  const eventPayload = {
    schemaVersion: '1.0',
    event: 'CALL_COMPLETED',
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    organizationId: crypto.randomUUID(),
    businessId: crypto.randomUUID(),
    lead: {
      id: testPayload.lead.id,
      phone: testPayload.lead.phone,
    },
    call: {
      callSessionId: crypto.randomUUID(),
      direction: 'OUTBOUND',
      channel: 'PSTN',
      status: 'COMPLETED',
      startedAt: new Date(Date.now() - 60000).toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds: 60,
    },
    outcome: {
      qualificationDecision: 'QUALIFIED',
      sentiment: 'POSITIVE',
      intentScore: 90,
      summary: 'Customer confirmed interest in solar installation.',
      followUpAction: 'Schedule on-site assessment',
    },
  };
  const eventJson = JSON.stringify(eventPayload);
  const eventPath = '/api/v1/integrations/leadnexus/events';

  const res8a = await fetch(`${BASE_URL}${eventPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: eventJson,
  });
  console.log(`Unsigned event status: ${res8a.status} (Expected 401)`);

  const { headers: validEventHeaders } = signRequest({
    rawBody: eventJson,
    secret: SHARED_SECRET,
    method: 'POST',
    path: eventPath,
  });
  const res8b = await fetch(`${BASE_URL}${eventPath}`, {
    method: 'POST',
    headers: validEventHeaders,
    body: eventJson,
  });
  console.log(`Signed event status: ${res8b.status} (Expected 200)`);
  const data8b = await res8b.json();
  console.log('Signed event response:', data8b);
}

runContractAudit().catch(err => {
  console.error('Contract audit error:', err);
  process.exit(1);
});

