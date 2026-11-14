import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit } from "../src/lib/rate-limit";

describe("Public Enquiry Rate Limiter & Abuse Protection Suite", () => {
  it("permits initial requests up to the configured limit", () => {
    const testId = `test-ip-${Date.now()}`;
    const limit = 3;
    const windowSec = 10;

    const res1 = checkRateLimit(testId, limit, windowSec);
    assert.equal(res1.allowed, true);
    assert.equal(res1.remaining, 2);

    const res2 = checkRateLimit(testId, limit, windowSec);
    assert.equal(res2.allowed, true);
    assert.equal(res2.remaining, 1);

    const res3 = checkRateLimit(testId, limit, windowSec);
    assert.equal(res3.allowed, true);
    assert.equal(res3.remaining, 0);
  });

  it("blocks requests that exceed the limit within the time window", () => {
    const testId = `blocked-ip-${Date.now()}`;
    const limit = 2;
    const windowSec = 10;

    checkRateLimit(testId, limit, windowSec);
    checkRateLimit(testId, limit, windowSec);

    // 3rd attempt should be blocked
    const resBlocked = checkRateLimit(testId, limit, windowSec);
    assert.equal(resBlocked.allowed, false);
    assert.equal(resBlocked.remaining, 0);
    assert.ok(resBlocked.error?.includes("Too many submissions"));
  });
});
