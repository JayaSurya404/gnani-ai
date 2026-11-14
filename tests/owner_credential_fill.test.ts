import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../src/app/api/dev/credentials/route";

describe("Demo Owner Credential Endpoint Suite", () => {
  const TEST_EMAIL = "admin@kaverisolar.in";
  const TEST_PASSWORD = "StrongRandomPassword2026!";

  beforeEach(() => {
    process.env.OWNER_CREDENTIAL_FILL_ENABLED = "true";
    process.env.DEV_COMPANY_EMAIL = TEST_EMAIL;
    process.env.DEV_COMPANY_PASSWORD = TEST_PASSWORD;
  });

  it("returns 404 if OWNER_CREDENTIAL_FILL_ENABLED is explicitly set to false", async () => {
    process.env.OWNER_CREDENTIAL_FILL_ENABLED = "false";

    const res = await GET();
    assert.equal(res.status, 404);
  });

  it("returns 404 if credentials are not configured", async () => {
    delete process.env.DEV_COMPANY_EMAIL;
    delete process.env.DEV_COMPANY_PASSWORD;

    const res = await GET();
    assert.equal(res.status, 404);
  });

  it("returns 200 with credentials and no-store headers on GET", async () => {
    const res = await GET();
    assert.equal(res.status, 200);

    // Verify Cache-Control header
    const cacheControl = res.headers.get("Cache-Control");
    assert.ok(cacheControl?.includes("no-store"), "Must have Cache-Control: no-store");

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.email, TEST_EMAIL);
    assert.equal(body.password, TEST_PASSWORD);
  });

  it("returns 200 with credentials on POST", async () => {
    const res = await POST();
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.email, TEST_EMAIL);
    assert.equal(body.password, TEST_PASSWORD);
  });
});
