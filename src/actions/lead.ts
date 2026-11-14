"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getActiveOrganizationId } from "@/actions/organization";
import type { Lead, LeadTemperature, LeadStatus } from "@/lib/types";

export interface LeadIntelligenceData {
  intentSignals: string[];
  objectionsRaised: string[];
  buyingStage: string;
  recommendedNextAction: string;
  qualificationReasons: string[];
  budgetEstimate: string;
  urgencyRating: string;
}

export interface LeadEventItem {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  createdAt: string;
}

export interface LeadDetailResult {
  lead: Lead;
  intelligence?: LeadIntelligenceData;
  events: LeadEventItem[];
}

/**
 * Calculates rules-based intent score and temperature
 */
export function calculateLeadScore(data: {
  monthlyBill?: string;
  systemSize?: string;
  roofType?: string;
  requestCallback?: boolean;
}): { score: number; temperature: LeadTemperature } {
  let score = 50; // base score

  const bill = parseInt(data.monthlyBill?.replace(/[^0-9]/g, "") || "0", 10);
  if (bill >= 8000) score += 25;
  else if (bill >= 4000) score += 15;
  else if (bill >= 2000) score += 10;

  if (data.requestCallback) score += 15;
  if (data.systemSize?.includes("5kW") || data.systemSize?.includes("Hybrid")) score += 10;
  if (data.roofType === "RCC" || data.roofType === "Independent House") score += 5;

  score = Math.min(Math.max(score, 10), 98);

  let temperature: LeadTemperature = "WARM";
  if (score >= 75) temperature = "HOT";
  else if (score < 45) temperature = "COLD";

  return { score, temperature };
}

/**
 * Public Enquiry Submission Handler (Anonymous visitors on /p/[slug])
 */
export async function submitPublicEnquiryAction(formData: FormData): Promise<{
  success: boolean;
  error?: string;
  leadId?: string;
}> {
  const name = (formData.get("name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const orgId = (formData.get("organizationId") as string)?.trim();
  const businessId = (formData.get("businessId") as string)?.trim() || null;
  const primaryInterest = (formData.get("primaryInterest") as string)?.trim() || "Solar Consultation";
  const monthlyBill = (formData.get("monthlyBill") as string)?.trim();
  const systemSize = (formData.get("systemSize") as string)?.trim();
  const location = (formData.get("location") as string)?.trim() || null;
  const utmSource = (formData.get("utm_source") as string)?.trim() || "Public Landing Page";
  const utmCampaign = (formData.get("utm_campaign") as string)?.trim();
  const requestCallback = formData.get("requestCallback") === "true";

  // Spam protection honeypot
  const botTrap = formData.get("website_url") || formData.get("_gotcha");
  if (botTrap) {
    return { success: true };
  }

  if (!name || name.length < 2) {
    return { success: false, error: "Please provide a valid full name." };
  }

  const cleanPhone = phone ? phone.replace(/[^0-9]/g, "") : "";
  if (!cleanPhone || cleanPhone.length < 10) {
    return { success: false, error: "Please provide a valid 10-digit phone number." };
  }

  // Rate limiting per phone number
  const phoneRateLimit = checkRateLimit(`lead_action:${cleanPhone}`, 3, 300);
  if (!phoneRateLimit.allowed) {
    return { success: false, error: phoneRateLimit.error };
  }

  if (!orgId) {
    return { success: false, error: "Missing organization identifier." };
  }

  const { score, temperature } = calculateLeadScore({
    monthlyBill,
    systemSize,
    requestCallback,
  });

  const adminClient = createAdminClient();
  const supabase = adminClient ?? (await createClient());

  // Find matching campaign if utmCampaign is provided
  let campaignId: string | null = null;
  if (utmCampaign) {
    const { data: camp } = await supabase
      .from("campaigns")
      .select("id")
      .eq("organization_id", orgId)
      .eq("slug", utmCampaign)
      .maybeSingle();

    if (camp) {
      campaignId = camp.id;
      // Increment campaign leads count
      await supabase.rpc("increment_campaign_leads" as never, {
        campaign_uuid: camp.id,
      } as never);
    }
  }

  // 1. Insert Lead
  const { data: newLead, error: leadError } = await supabase
    .from("leads")
    .insert({
      organization_id: orgId,
      business_id: businessId,
      campaign_id: campaignId,
      name,
      phone,
      email,
      temperature,
      status: "NEW",
      score,
      source: utmSource,
      primary_interest: primaryInterest,
      location,
      summary: `Inquiry submitted via public page. Current monthly bill: ₹${monthlyBill || "Not specified"}. Preferred system: ${systemSize || "Not specified"}.`,
      do_not_call: false,
    })
    .select("id")
    .single();

  if (leadError || !newLead) {
    console.error("[PublicEnquiry] Insert error:", leadError?.message);
    return {
      success: false,
      error: "Failed to submit enquiry. Please try again or contact us directly.",
    };
  }

  // 2. Insert Lead Event
  await supabase.from("lead_events").insert({
    lead_id: newLead.id,
    organization_id: orgId,
    event_type: "FORM_SUBMIT",
    title: "Public Landing Page Enquiry",
    description: `Submitted interest for ${primaryInterest}. Monthly bill: ₹${monthlyBill || "N/A"}.`,
    metadata: {
      monthlyBill,
      systemSize,
      utmSource,
      utmCampaign,
      requestCallback,
    },
  });

  // 3. Insert Lead Intelligence Record
  const intentSignals = [
    `Submitted enquiry via ${utmSource}`,
    monthlyBill ? `Stated monthly electricity expenditure of ₹${monthlyBill}` : "Requested general solar consultation",
    systemSize ? `Interested in ${systemSize}` : "Inquired about turnkey installation",
  ];

  if (requestCallback) {
    intentSignals.push("Explicitly requested AI Voice callback consultation");
  }

  await supabase.from("lead_intelligence").insert({
    lead_id: newLead.id,
    intent_signals: intentSignals,
    objections_raised: [],
    buying_stage: score >= 75 ? "Evaluation / Ready to Purchase" : "Information Gathering",
    recommended_next_action:
      score >= 75
        ? "Initiate AI voice agent discovery call within 15 minutes"
        : "Send PM Surya Ghar subsidy guide via WhatsApp / email",
    qualification_reasons: [
      `Intent score calculated at ${score}/100 based on expenditure and callback request`,
    ],
    budget_estimate: monthlyBill ? `₹${parseInt(monthlyBill || "0", 10) * 35}` : "To be qualified",
    urgency_rating: score >= 75 ? "HIGH" : "MEDIUM",
  });

  return { success: true, leadId: newLead.id };
}

/**
 * Capture dropped visitor session into lead_recovery_records
 */
export async function captureDroppedSessionAction(data: {
  organizationId: string;
  phone?: string;
  email?: string;
  abandonedUrl: string;
  activitySummary: string;
  dwellTimeSeconds: number;
}): Promise<{ success: boolean }> {
  if (!data.phone && !data.email) return { success: false };

  const supabase = await createClient();

  await supabase.from("lead_recovery_records").insert({
    organization_id: data.organizationId,
    phone: data.phone || null,
    email: data.email || null,
    abandoned_url: data.abandonedUrl,
    activity_summary: data.activitySummary,
    dwell_time_seconds: data.dwellTimeSeconds,
    recovery_score: 65,
    is_recovered: false,
  });

  return { success: true };
}

/**
 * Re-engage an abandoned visitor from the recovery queue
 */
export async function reengageRecoveryRecordAction(recoveryId: string): Promise<{
  success: boolean;
  error?: string;
  leadId?: string;
}> {
  const supabase = await createClient();
  const orgId = await getActiveOrganizationId();

  if (!orgId) {
    return { success: false, error: "Active organization required." };
  }

  // Fetch recovery record
  const { data: record, error: recordError } = await supabase
    .from("lead_recovery_records")
    .select("*")
    .eq("id", recoveryId)
    .eq("organization_id", orgId)
    .single();

  if (recordError || !record) {
    return { success: false, error: "Recovery record not found." };
  }

  // Create lead from recovery record
  const { data: newLead, error: leadError } = await supabase
    .from("leads")
    .insert({
      organization_id: orgId,
      name: "Recovered Prospect",
      phone: record.phone || "+91 00000 00000",
      email: record.email,
      temperature: "HOT",
      status: "NEW",
      score: 80,
      source: "Abandoned Lead Recovery",
      primary_interest: "Rooftop Solar Inquiry (Recovered)",
      summary: record.activity_summary || "Prospect dropped off before form submission; re-engaged via triage queue.",
      do_not_call: false,
    })
    .select("id")
    .single();

  if (leadError || !newLead) {
    return { success: false, error: leadError?.message || "Failed to create recovered lead." };
  }

  // Mark record as recovered
  await supabase
    .from("lead_recovery_records")
    .update({
      is_recovered: true,
      recovered_lead_id: newLead.id,
    })
    .eq("id", recoveryId);

  // Add event
  await supabase.from("lead_events").insert({
    lead_id: newLead.id,
    organization_id: orgId,
    event_type: "RECOVERY_CONVERTED",
    title: "Prospect Recovered from Drop-off Queue",
    description: `Original activity: ${record.activity_summary}`,
  });

  revalidatePath("/recovery");
  revalidatePath("/leads");
  return { success: true, leadId: newLead.id };
}

/**
 * Update Lead Status (e.g. QUALIFIED, CONTACTED, DO_NOT_CALL)
 */
export async function updateLeadStatusAction(
  leadId: string,
  newStatus: LeadStatus
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const orgId = await getActiveOrganizationId();

  if (!orgId) {
    return { success: false, error: "Active organization required." };
  }

  const doNotCall = newStatus === "DO_NOT_CALL";

  const { error } = await supabase
    .from("leads")
    .update({
      status: newStatus,
      do_not_call: doNotCall,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("organization_id", orgId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Record status transition in lead_events
  await supabase.from("lead_events").insert({
    lead_id: leadId,
    organization_id: orgId,
    event_type: "STATUS_CHANGE",
    title: `Lead status changed to ${newStatus}`,
    description: doNotCall ? "Compliance rule: Outbound calling suppressed per caller request." : null,
  });

  revalidatePath("/leads");
  return { success: true };
}

/**
 * Fetch detailed lead information including timeline events and AI intelligence
 */
export async function getLeadDetailsAction(leadId: string): Promise<LeadDetailResult | null> {
  const supabase = await createClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) return null;

  // Fetch intelligence
  const { data: intel } = await supabase
    .from("lead_intelligence")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();

  // Fetch events
  const { data: events } = await supabase
    .from("lead_events")
    .select("id, event_type, title, description, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  return {
    lead: {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email ?? undefined,
      temperature: lead.temperature,
      status: lead.status,
      score: lead.score,
      source: lead.source,
      primaryInterest: lead.primary_interest ?? "General Inquiry",
      location: lead.location ?? undefined,
      lastActivityAt: new Date(lead.last_activity_at).toLocaleDateString(),
      summary: lead.summary ?? undefined,
    },
    intelligence: intel
      ? {
          intentSignals: (intel.intent_signals as string[]) || [],
          objectionsRaised: (intel.objections_raised as string[]) || [],
          buyingStage: intel.buying_stage || "Discovery",
          recommendedNextAction: intel.recommended_next_action || "Reach out to lead",
          qualificationReasons: (intel.qualification_reasons as string[]) || [],
          budgetEstimate: intel.budget_estimate || "Unknown",
          urgencyRating: intel.urgency_rating || "MEDIUM",
        }
      : undefined,
    events: (events || []).map((e) => ({
      id: e.id,
      eventType: e.event_type,
      title: e.title,
      description: e.description,
      createdAt: new Date(e.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      }),
    })),
  };
}
