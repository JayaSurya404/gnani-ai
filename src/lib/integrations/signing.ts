import crypto from "crypto";
import { INTEGRATION_PROTOCOL_VERSION } from "./contract";

// Maximum clock skew window: 5 minutes (300 seconds)
export const MAX_CLOCK_DRIFT_SECONDS = 300;

// In-memory replay cache to protect against duplicate requests within window
const processedRequests = new Map<string, number>();

function purgeExpiredRequests() {
  const cutoff = Date.now() - MAX_CLOCK_DRIFT_SECONDS * 1000 * 2;
  for (const [id, ts] of processedRequests.entries()) {
    if (ts < cutoff) {
      processedRequests.delete(id);
    }
  }
}

export function computeBodyDigest(rawBody: string | Buffer): string {
  const content = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildCanonicalString(params: {
  timestamp: string | number;
  method: string;
  path: string;
  requestId: string;
  bodyDigest: string;
}): string {
  return [
    INTEGRATION_PROTOCOL_VERSION,
    String(params.timestamp),
    params.method.toUpperCase(),
    params.path,
    params.requestId,
    params.bodyDigest,
  ].join("\n");
}

export function signIntegrationRequest(params: {
  rawBody: string | Buffer;
  secret: string;
  method: string;
  path: string;
  requestId?: string;
  timestamp?: number;
}): {
  signature: string;
  timestamp: string;
  requestId: string;
  headers: Record<string, string>;
} {
  const requestId = params.requestId || crypto.randomUUID();
  const timestamp = String(params.timestamp || Math.floor(Date.now() / 1000));
  const bodyDigest = computeBodyDigest(params.rawBody);
  const canonicalString = buildCanonicalString({
    timestamp,
    method: params.method,
    path: params.path,
    requestId,
    bodyDigest,
  });

  const digest = crypto
    .createHmac("sha256", params.secret)
    .update(canonicalString, "utf8")
    .digest("hex");

  const signature = `v1=${digest}`;

  return {
    signature,
    timestamp,
    requestId,
    headers: {
      "x-integration-signature": signature,
      "x-integration-timestamp": timestamp,
      "x-integration-request-id": requestId,
      "Content-Type": "application/json",
    },
  };
}

export interface VerificationResult {
  isValid: boolean;
  reason?: string;
}

export function verifyIntegrationSignature(params: {
  rawBody: string | Buffer;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  requestId: string | null | undefined;
  secret: string;
  method: string;
  path: string;
  maxDriftSeconds?: number;
  skipReplayCheck?: boolean;
}): VerificationResult {
  const {
    rawBody,
    signature,
    timestamp,
    requestId,
    secret,
    method,
    path,
    maxDriftSeconds = MAX_CLOCK_DRIFT_SECONDS,
    skipReplayCheck = false,
  } = params;

  if (!secret) {
    return { isValid: false, reason: "Shared integration secret is not configured" };
  }

  if (!signature || !signature.startsWith("v1=")) {
    return { isValid: false, reason: "Missing or malformed x-integration-signature header" };
  }

  if (!timestamp) {
    return { isValid: false, reason: "Missing x-integration-timestamp header" };
  }

  if (!requestId) {
    return { isValid: false, reason: "Missing x-integration-request-id header" };
  }

  // 1. Verify Timestamp Clock Drift
  const requestTimestamp = parseInt(timestamp, 10);
  if (isNaN(requestTimestamp)) {
    return { isValid: false, reason: "Invalid numeric format in x-integration-timestamp" };
  }

  const now = Math.floor(Date.now() / 1000);
  const drift = Math.abs(now - requestTimestamp);
  if (drift > maxDriftSeconds) {
    return {
      isValid: false,
      reason: `Clock drift exceeds limit (${drift}s > ${maxDriftSeconds}s allowed)`,
    };
  }

  // 2. Replay Protection
  if (!skipReplayCheck) {
    purgeExpiredRequests();
    if (processedRequests.has(requestId)) {
      return { isValid: false, reason: `Replay detected: request-id ${requestId} already processed` };
    }
  }

  // 3. Compute Expected Signature
  const bodyDigest = computeBodyDigest(rawBody);
  const canonicalString = buildCanonicalString({
    timestamp,
    method,
    path,
    requestId,
    bodyDigest,
  });

  const expectedDigest = crypto
    .createHmac("sha256", secret)
    .update(canonicalString, "utf8")
    .digest("hex");
  const expectedSignature = `v1=${expectedDigest}`;

  // 4. Constant-Time Timing-Safe Equality Check
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return { isValid: false, reason: "Signature mismatch" };
  }

  const matches = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  if (!matches) {
    return { isValid: false, reason: "Signature mismatch" };
  }

  // Record successful request for replay protection
  if (!skipReplayCheck) {
    processedRequests.set(requestId, Date.now());
  }

  return { isValid: true };
}

