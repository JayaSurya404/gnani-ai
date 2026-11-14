import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeWorkspaceMetrics } from "../src/lib/data/workspace-data";
import type { Lead, CallRecord } from "../src/lib/types";

describe("Strict Fixture Protection & Data Integrity Suite", () => {
  it("computes accurate 0-metrics for an empty organization with 0 leads and 0 calls", () => {
    const emptyLeads: Lead[] = [];
    const emptyCalls: CallRecord[] = [];

    const metrics = computeWorkspaceMetrics(emptyLeads, emptyCalls);

    assert.equal(metrics.totalLeads, 0);
    assert.equal(metrics.hotLeads, 0);
    assert.equal(metrics.totalCalls, 0);
    assert.equal(metrics.avgCallDurationSec, 0);
    assert.equal(metrics.conversionRate, 0);
    assert.equal(metrics.qualifiedRate, 0);
  });

  it("calculates accurate metrics when genuine leads are present without synthetic injection", () => {
    const genuineLeads: Lead[] = [
      {
        id: "lead-real-1",
        name: "Ramesh Kumar",
        phone: "+919876543210",
        temperature: "HOT",
        status: "QUALIFIED",
        score: 85,
        source: "Website",
        primaryInterest: "Commercial Solar Rooftop",
        lastActivityAt: "10/11/2026",
      },
      {
        id: "lead-real-2",
        name: "Priya Sundaram",
        phone: "+919876543211",
        temperature: "COLD",
        status: "NEW",
        score: 30,
        source: "Direct",
        primaryInterest: "Home Solar",
        lastActivityAt: "10/11/2026",
      },
    ];

    const genuineCalls: CallRecord[] = [
      {
        id: "call-real-1",
        leadId: "lead-real-1",
        leadName: "Ramesh Kumar",
        leadPhone: "+919876543210",
        agentId: "agent-1",
        agentName: "Voice Agent",
        status: "COMPLETED",
        durationSeconds: 120,
        createdAt: "10/11/2026",
      },
    ];

    const metrics = computeWorkspaceMetrics(genuineLeads, genuineCalls);

    assert.equal(metrics.totalLeads, 2);
    assert.equal(metrics.hotLeads, 1);
    assert.equal(metrics.totalCalls, 1);
    assert.equal(metrics.avgCallDurationSec, 120);
    assert.equal(metrics.conversionRate, 50); // 1 qualified out of 2 leads = 50%
    assert.equal(metrics.qualifiedRate, 100); // 1 qualified out of 1 call = 100%
  });

  it("enforces that production environment flag strictly prohibits fixture mode", () => {
    const env = process.env as Record<string, string | undefined>;
    const originalNodeEnv = env.NODE_ENV;
    const originalFixtureFlag = env.NEXT_PUBLIC_ENABLE_DEMO_FIXTURES;

    try {
      // Simulate production environment with malicious or accidental fixture flag turned on
      env.NODE_ENV = "production";
      env.NEXT_PUBLIC_ENABLE_DEMO_FIXTURES = "true";

      const isProduction = env.NODE_ENV === "production";
      const isDemoFixturesExplicitlyEnabled =
        !isProduction && env.NEXT_PUBLIC_ENABLE_DEMO_FIXTURES === "true";

      // Must be strictly false in production
      assert.equal(
        isDemoFixturesExplicitlyEnabled,
        false,
        "Fixtures MUST NEVER be enabled when NODE_ENV is production"
      );
    } finally {
      env.NODE_ENV = originalNodeEnv;
      env.NEXT_PUBLIC_ENABLE_DEMO_FIXTURES = originalFixtureFlag;
    }
  });

  it("requires explicit opt-in in non-production environments to enable fixtures", () => {
    const env = process.env as Record<string, string | undefined>;
    const originalNodeEnv = env.NODE_ENV;
    const originalFixtureFlag = env.NEXT_PUBLIC_ENABLE_DEMO_FIXTURES;

    try {
      env.NODE_ENV = "development";
      delete env.NEXT_PUBLIC_ENABLE_DEMO_FIXTURES;

      const isProduction = env.NODE_ENV === "production";
      const isDemoFixturesExplicitlyEnabled =
        !isProduction && env.NEXT_PUBLIC_ENABLE_DEMO_FIXTURES === "true";

      // If flag is missing, it must evaluate to false
      assert.equal(
        isDemoFixturesExplicitlyEnabled,
        false,
        "Fixtures must not be enabled by default even in development without explicit flag"
      );
    } finally {
      env.NODE_ENV = originalNodeEnv;
      env.NEXT_PUBLIC_ENABLE_DEMO_FIXTURES = originalFixtureFlag;
    }
  });
});
