import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/dev/credentials/route";

describe("Owner Credential Protected Fill Endpoint Suite", () => {
  const TEST_KEY = "test_owner_key_secret_12345";
  const TEST_EMAIL = "admin@kaverisolar.in";
  const TEST_PASSWORD = "StrongRandomPassword2026!";

  beforeEach(() => {
    process.env.OWNER_CREDENTIAL_FILL_ENABLED = "true";
    process.env.OWNER_CREDENTIAL_FILL_KEY = TEST_KEY;
    process.env.DEV_COMPANY_EMAIL = TEST_EMAIL;
    process.env.DEV_COMPANY_PASSWORD = TEST_PASSWORD;
  });

  it("returns 404 if OWNER_CREDENTIAL_FILL_ENABLED is explicitly disabled", async () => {
    process.env.OWNER_CREDENTIAL_FILL_ENABLED = "false";

    const req = new NextRequest("http://localhost:3000/api/dev/credentials", {
      method: "POST",
      body: JSON.stringify({ key: TEST_KEY }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    assert.equal(res.status, 404);
  });

  it("returns 401 when an invalid key is submitted", async () => {
    const req = new NextRequest("http://localhost:3000/api/dev/credentials", {
      method: "POST",
      body: JSON.stringify({ key: "wrong_password_key" }),
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.0.1",
      },
    });

    const res = await POST(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes("Invalid administrator access key"));
  });

  it("returns 401 when empty or non-string key is submitted", async () => {
    const req = new NextRequest("http://localhost:3000/api/dev/credentials", {
      method: "POST",
      body: JSON.stringify({ key: "" }),
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.0.2",
      },
    });

    const res = await POST(req);
    assert.equal(res.status, 401);
  });

  it("returns 200 with credentials and no-store headers on valid key", async () => {
    const req = new NextRequest("http://localhost:3000/api/dev/credentials", {
      method: "POST",
      body: JSON.stringify({ key: TEST_KEY }),
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.0.3",
      },
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    // Verify Cache-Control header
    const cacheControl = res.headers.get("Cache-Control");
    assert.ok(cacheControl?.includes("no-store"), "Must have Cache-Control: no-store");

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.email, TEST_EMAIL);
    assert.equal(body.password, TEST_PASSWORD);
  });

  it("enforces sliding-window rate limit on repeated attempts from same IP", async () => {
    const testIp = `192.168.100.${Date.now() % 250}`;

    // Make 10 requests (the limit)
    for (let i = 0; i < 10; i++) {
      const req = new NextRequest("http://localhost:3000/api/dev/credentials", {
        method: "POST",
        body: JSON.stringify({ key: "wrong_key" }),
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": testIp,
        },
      });
      await POST(req);
    }

    // 11th request should be rate-limited (HTTP 429)
    const rateLimitedReq = new NextRequest("http://localhost:3000/api/dev/credentials", {
      method: "POST",
      body: JSON.stringify({ key: TEST_KEY }),
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": testIp,
      },
    });

    const res = await POST(rateLimitedReq);
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes("Too many unlock attempts"));
  });
});
