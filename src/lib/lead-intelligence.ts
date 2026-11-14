import type { LeadTemperature } from "@/lib/types";

export interface LeadScoringInput {
  name: string;
  phone: string;
  email?: string | null;
  primaryInterest?: string;
  monthlyBill?: string | number;
  systemSize?: string | number;
  source?: string;
  dwellTimeSeconds?: number;
  hasInteractedWithCalculator?: boolean;
}

export interface LeadIntelligenceResult {
  score: number;
  temperature: LeadTemperature;
  intentClassification: "COMMERCIAL_EPC" | "RESIDENTIAL_ROOFTOP" | "INDUSTRIAL_CAPTIVE" | "EXPLORATORY";
  priorityLevel: "URGENT" | "HIGH" | "STANDARD" | "LOW";
  qualificationSummary: string;
  recommendedPitch: string;
  estimatedDealSizeInr: number;
}

/**
 * Enterprise Lead Intelligence Engine
 * Deterministic, multi-variable intent scoring and qualification
 */
export function calculateLeadIntelligence(input: LeadScoringInput): LeadIntelligenceResult {
  let score = 40; // Base score for any contact with phone

  // 1. Contact Completeness (+10 for valid email, +5 for full name with multiple words)
  if (input.email && input.email.includes("@")) {
    score += 10;
  }
  if (input.name && input.name.trim().split(/\s+/).length >= 2) {
    score += 5;
  }

  // 2. Intent & Requirement Analysis
  const interest = (input.primaryInterest || "").toLowerCase();
  let intent: LeadIntelligenceResult["intentClassification"] = "RESIDENTIAL_ROOFTOP";
  let estimatedDealSize = 250000; // Base residential 3kW-5kW

  if (interest.includes("commercial") || interest.includes("office") || interest.includes("school") || interest.includes("hospital")) {
    intent = "COMMERCIAL_EPC";
    score += 25;
    estimatedDealSize = 1500000; // ~25kW commercial
  } else if (interest.includes("industrial") || interest.includes("factory") || interest.includes("mill") || interest.includes("captive") || interest.includes("mw")) {
    intent = "INDUSTRIAL_CAPTIVE";
    score += 30;
    estimatedDealSize = 6000000; // ~100kW+ industrial
  } else if (interest.includes("residential") || interest.includes("home") || interest.includes("villa") || interest.includes("rooftop")) {
    intent = "RESIDENTIAL_ROOFTOP";
    score += 15;
    estimatedDealSize = 350000;
  } else {
    intent = "EXPLORATORY";
  }

  // 3. Financial Capacity (Monthly Bill)
  const billNum = typeof input.monthlyBill === "number" ? input.monthlyBill : parseInt(String(input.monthlyBill || "0").replace(/[^0-9]/g, ""), 10);
  if (billNum >= 50000) {
    score += 25;
    estimatedDealSize = Math.max(estimatedDealSize, 3500000);
  } else if (billNum >= 15000) {
    score += 20;
    estimatedDealSize = Math.max(estimatedDealSize, 1200000);
  } else if (billNum >= 5000) {
    score += 15;
    estimatedDealSize = Math.max(estimatedDealSize, 500000);
  } else if (billNum > 0) {
    score += 5;
  }

  // 4. Digital Engagement & Behaviour
  if (input.hasInteractedWithCalculator) {
    score += 10;
  }
  if (input.dwellTimeSeconds && input.dwellTimeSeconds >= 60) {
    score += 10;
  } else if (input.dwellTimeSeconds && input.dwellTimeSeconds >= 20) {
    score += 5;
  }

  // 5. Source Quality Attribution
  const src = (input.source || "").toLowerCase();
  if (src.includes("inbound") || src.includes("direct") || src.includes("referral")) {
    score += 10;
  } else if (src.includes("google") || src.includes("adwords") || src.includes("search")) {
    score += 8;
  } else if (src.includes("facebook") || src.includes("instagram") || src.includes("social")) {
    score += 4;
  }

  // Bound score 0 to 100
  score = Math.min(100, Math.max(10, score));

  // Determine temperature
  let temperature: LeadTemperature = "COLD";
  if (score >= 75) {
    temperature = "HOT";
  } else if (score >= 50) {
    temperature = "WARM";
  }

  // Determine priority
  let priorityLevel: LeadIntelligenceResult["priorityLevel"] = "STANDARD";
  if (score >= 85) {
    priorityLevel = "URGENT";
  } else if (score >= 70) {
    priorityLevel = "HIGH";
  } else if (score < 40) {
    priorityLevel = "LOW";
  }

  // Tailored Qualification Summary and Pitch Recommendations
  let qualificationSummary = "";
  let recommendedPitch = "";

  switch (intent) {
    case "INDUSTRIAL_CAPTIVE":
      qualificationSummary = `High-value industrial prospect (Score: ${score}/100, Est. Deal: ₹${(estimatedDealSize / 100000).toFixed(1)}L). Significant tariff reduction driver.`;
      recommendedPitch = "Highlight accelerated depreciation (AD) tax benefits, OPEX vs CAPEX models, and guaranteed Levelized Cost of Energy (LCOE) under ₹3.20/unit.";
      break;
    case "COMMERCIAL_EPC":
      qualificationSummary = `Qualified commercial buyer with monthly energy spend ₹${billNum.toLocaleString("en-IN")}. High ROI sensitivity.`;
      recommendedPitch = "Emphasize 3.2-year payback period, net metering approval assistance, and Tier-1 bifacial panels with 25-year performance warranty.";
      break;
    case "RESIDENTIAL_ROOFTOP":
      qualificationSummary = `Residential rooftop homeowner enquiry (Score: ${score}/100). Prime candidate for subsidy and net metering.`;
      recommendedPitch = "Offer PM Surya Ghar Muft Bijli Yojana subsidy guidance (up to ₹78,000 direct subsidy), zero-cost EMI options, and rapid 7-day commissioning.";
      break;
    default:
      qualificationSummary = `General inbound prospect (Score: ${score}/100). Requires requirement gathering during discovery call.`;
      recommendedPitch = "Initiate discovery on average monthly electricity consumption and roof area feasibility.";
      break;
  }

  return {
    score,
    temperature,
    intentClassification: intent,
    priorityLevel,
    qualificationSummary,
    recommendedPitch,
    estimatedDealSizeInr: estimatedDealSize,
  };
}

