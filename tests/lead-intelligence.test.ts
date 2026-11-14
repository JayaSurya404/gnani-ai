import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateLeadIntelligence } from "../src/lib/lead-intelligence";

describe("Lead Intelligence & Intent Scoring Suite", () => {
  it("qualifies large industrial energy consumer with high intent and deal size", () => {
    const result = calculateLeadIntelligence({
      name: "Suresh Mehra",
      phone: "+91 98401 99999",
      email: "suresh@spinningmill.in",
      primaryInterest: "100kW Industrial Captive Solar Mill",
      monthlyBill: 75000,
      hasInteractedWithCalculator: true,
      dwellTimeSeconds: 90,
      source: "Google Search Inbound",
    });

    assert.ok(result.score >= 80, `Expected score >= 80, got ${result.score}`);
    assert.equal(result.temperature, "HOT");
    assert.equal(result.intentClassification, "INDUSTRIAL_CAPTIVE");
    assert.equal(result.priorityLevel, "URGENT");
    assert.ok(result.estimatedDealSizeInr >= 3500000);
    assert.ok(result.recommendedPitch.includes("accelerated depreciation"));
  });

  it("calculates accurate residential rooftop metrics with PM Surya Ghar subsidy", () => {
    const result = calculateLeadIntelligence({
      name: "Lakshmi Narayanan",
      phone: "+91 98765 43210",
      email: "lakshmi@gmail.com",
      primaryInterest: "Residential 3BHK Home Rooftop",
      monthlyBill: 4500,
      hasInteractedWithCalculator: true,
      dwellTimeSeconds: 45,
      source: "Direct",
    });

    assert.ok(result.score >= 50 && result.score <= 100);
    assert.ok(result.temperature === "WARM" || result.temperature === "HOT");
    assert.equal(result.intentClassification, "RESIDENTIAL_ROOFTOP");
    assert.ok(result.recommendedPitch.includes("PM Surya Ghar"));
  });

  it("scores exploratory visitor with minimal details as cold or exploratory", () => {
    const result = calculateLeadIntelligence({
      name: "Visitor",
      phone: "+91 99999 11111",
      primaryInterest: "General Enquiry",
      monthlyBill: 0,
      dwellTimeSeconds: 5,
    });

    assert.ok(result.score < 60);
    assert.equal(result.intentClassification, "EXPLORATORY");
    assert.ok(result.recommendedPitch.includes("discovery"));
  });

  it("enforces strict score boundary between 10 and 100", () => {
    const minResult = calculateLeadIntelligence({
      name: "",
      phone: "1234567890",
    });
    assert.ok(minResult.score >= 10);

    const maxResult = calculateLeadIntelligence({
      name: "Enterprise Chief Officer",
      phone: "+91 98765 43210",
      email: "executive@conglomerate.com",
      primaryInterest: "500kW Industrial Factory Captive Installation",
      monthlyBill: 500000,
      hasInteractedWithCalculator: true,
      dwellTimeSeconds: 300,
      source: "Direct Referral",
    });
    assert.ok(maxResult.score <= 100);
    assert.equal(maxResult.score, 100);
  });
});

