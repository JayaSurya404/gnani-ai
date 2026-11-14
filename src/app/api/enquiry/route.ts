import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { calculateLeadIntelligence } from "@/lib/lead-intelligence";

export async function POST(req: NextRequest) {
  try {
    // 1. IP and Rate Limiting
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";
    const ipRateLimit = checkRateLimit(`ip:${ip}`, 5, 60);

    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: ipRateLimit.error },
        { status: 429, headers: { "Retry-After": String(ipRateLimit.resetSeconds) } }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request payload." },
        { status: 400 }
      );
    }

    // 2. Honeypot check for spam bots
    if (body.website_url || body._gotcha) {
      return NextResponse.json({ success: true, message: "Enquiry submitted successfully." });
    }

    const {
      name,
      phone,
      email,
      organizationId,
      businessId,
      primaryInterest = "Solar Consultation",
      productId,
      productSku,
      productName,
      monthlyBill,
      systemSize,
      utmSource = "Public Page Inbound",
      utmCampaign,
      utmMedium,
      visitorSessionId,
      dwellTimeSeconds = 0,
      hasInteractedWithCalculator = false,
    } = body;

    // 3. Strict Input Validation
    if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
      return NextResponse.json(
        { success: false, error: "Full name must be between 2 and 100 characters." },
        { status: 400 }
      );
    }

    const cleanPhone = (phone && typeof phone === "string" ? phone : "").replace(/[^0-9+]/g, "").trim();
    if (cleanPhone.replace(/[^0-9]/g, "").length < 10 || cleanPhone.replace(/[^0-9]/g, "").length > 15) {
      return NextResponse.json(
        { success: false, error: "Please provide a valid phone number (10 to 15 digits)." },
        { status: 400 }
      );
    }

    // Secondary rate limit on the phone number
    const phoneRateLimit = checkRateLimit(`phone:${cleanPhone}`, 3, 300);
    if (!phoneRateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many enquiries for this phone number. Please try again later." },
        { status: 429 }
      );
    }

    if (email) {
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      if (typeof email !== "string" || !emailRegex.test(email)) {
        return NextResponse.json(
          { success: false, error: "Please provide a valid email address." },
          { status: 400 }
        );
      }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!organizationId || !uuidRegex.test(organizationId)) {
      return NextResponse.json(
        { success: false, error: "Valid organization ID is required." },
        { status: 400 }
      );
    }

    // 4. Calculate Lead Intelligence & Scoring
    const intelligence = calculateLeadIntelligence({
      name: name.trim(),
      phone: cleanPhone,
      email: email ? email.trim() : null,
      primaryInterest,
      monthlyBill,
      systemSize,
      source: utmSource,
      dwellTimeSeconds: Number(dwellTimeSeconds) || 0,
      hasInteractedWithCalculator: Boolean(hasInteractedWithCalculator),
    });

    // 5. Server-Side Execution with Admin or SSR client
    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    // Verify organization exists (and business if provided)
    let verifiedBusinessId = businessId;
    if (!verifiedBusinessId) {
      const { data: b } = await supabase
        .from("businesses")
        .select("id")
        .eq("organization_id", organizationId)
        .limit(1)
        .maybeSingle();
      if (b) verifiedBusinessId = b.id;
    }

    // 6. Lead Deduplication Check (Preserves genuine lead deduplication; ignores sample/test records)
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id, status, score, name, source")
      .eq("organization_id", organizationId)
      .eq("phone", cleanPhone)
      .neq("source", "SAMPLE_LEAD")
      .limit(1)
      .maybeSingle();

    let targetLeadId: string;
    let isDuplicate = false;

    if (existingLead) {
      // Existing lead: update activity timestamp, boost score if higher, append repeat enquiry event
      isDuplicate = true;
      targetLeadId = existingLead.id;

      const newScore = Math.max(existingLead.score, intelligence.score);
      const newTemp = newScore >= 75 ? "HOT" : newScore >= 50 ? "WARM" : "COLD";

      await supabase
        .from("leads")
        .update({
          score: newScore,
          temperature: newTemp,
          last_activity_at: new Date().toISOString(),
          summary: `${existingLead.name} submitted another enquiry: ${primaryInterest}. Monthly bill: ₹${monthlyBill || "N/A"}.`,
        } as never)
        .eq("id", targetLeadId);

      await supabase.from("lead_events").insert({
        organization_id: organizationId,
        lead_id: targetLeadId,
        event_type: "REPEAT_ENQUIRY",
        title: "Repeat Public Page Enquiry",
        description: `Prospect re-submitted enquiry for "${primaryInterest}". Monthly electricity bill: ₹${monthlyBill || "N/A"}.`,
        metadata: {
          utmSource,
          utmCampaign,
          utmMedium,
          monthlyBill,
          systemSize,
          visitorSessionId,
          intelligence,
          productId,
          productSku,
          productName,
        },
      } as never);
    } else {
      // New lead: insert lead record
      const insertPayload: Record<string, unknown> = {
        organization_id: organizationId,
        business_id: verifiedBusinessId || null,
        name: name.trim(),
        phone: cleanPhone,
        email: email ? email.trim() : null,
        primary_interest: primaryInterest,
        source: utmSource,
        score: intelligence.score,
        temperature: intelligence.temperature,
        status: "NEW",
        do_not_call: false,
        summary: intelligence.qualificationSummary,
        notes: productSku ? `Selected package: ${productName || primaryInterest} (SKU: ${productSku})` : null,
      };

      const { data: newLead, error: insertErr } = await supabase
        .from("leads")
        .insert(insertPayload as never)
        .select("id")
        .single();

      if (insertErr || !newLead) {
        console.error("[EnquiryAPI] Insert error:", insertErr?.message);
        return NextResponse.json(
          { success: false, error: "Failed to record enquiry. Please retry." },
          { status: 500 }
        );
      }

      targetLeadId = newLead.id;

      // Insert lead event
      await supabase.from("lead_events").insert({
        organization_id: organizationId,
        lead_id: targetLeadId,
        event_type: "FORM_SUBMIT",
        title: "Inbound Public Page Submission",
        description: `New prospect submitted web enquiry. Score: ${intelligence.score}/100 (${intelligence.temperature}).`,
        metadata: {
          utmSource,
          utmCampaign,
          utmMedium,
          monthlyBill,
          systemSize,
          visitorSessionId,
          intelligence,
          productId,
          productSku,
          productName,
        },
      } as never);

      // Insert into lead_intelligence table
      await supabase.from("lead_intelligence").insert({
        lead_id: targetLeadId,
        intent_classification: intelligence.intentClassification,
        budget_bracket: Number(monthlyBill) >= 50000 ? "ENTERPRISE_HIGH" : Number(monthlyBill) >= 10000 ? "COMMERCIAL_MID" : "RESIDENTIAL_STANDARD",
        timeline_urgency: intelligence.priorityLevel === "URGENT" ? "IMMEDIATE_7_DAYS" : intelligence.priorityLevel === "HIGH" ? "WITHIN_30_DAYS" : "EXPLORATORY",
        technical_depth: "STANDARD_SOLAR_INQUIRY",
        recommended_pitch: intelligence.recommendedPitch,
      } as never);
    }

    // 7. Check & Reconcile Abandoned Lead Recovery Records
    if (visitorSessionId || cleanPhone) {
      let recoveryQuery = supabase
        .from("lead_recovery_records")
        .update({
          is_recovered: true,
          recovered_lead_id: targetLeadId,
          activity_summary: `Recovered through successful enquiry submission on ${new Date().toLocaleDateString("en-IN")}`,
        } as never);

      if (visitorSessionId) {
        recoveryQuery = recoveryQuery.eq("visitor_session_id", visitorSessionId);
      } else {
        recoveryQuery = recoveryQuery.eq("phone", cleanPhone);
      }

      await recoveryQuery;
    }

    return NextResponse.json({
      success: true,
      leadId: targetLeadId,
      isDuplicate,
      intelligence: {
        score: intelligence.score,
        temperature: intelligence.temperature,
        intent: intelligence.intentClassification,
        priority: intelligence.priorityLevel,
      },
      message: isDuplicate
        ? "We have updated your existing enquiry. Our team will contact you shortly."
        : "Thank you! Your enquiry has been received successfully.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[EnquiryAPI] Unexpected error:", msg);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
