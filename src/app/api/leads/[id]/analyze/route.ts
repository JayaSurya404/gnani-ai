import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { calculateLeadIntelligence } from "@/lib/lead-intelligence";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    // 1. Fetch lead
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (leadErr || !lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    // 2. Calculate intelligence
    const intel = calculateLeadIntelligence({
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      primaryInterest: lead.primary_interest || "Solar Consultation",
      source: lead.source || "Inbound Form",
      hasInteractedWithCalculator: true,
      dwellTimeSeconds: 45,
    });

    // 3. Update lead in database
    await supabase
      .from("leads")
      .update({
        score: intel.score,
        temperature: intel.temperature,
        summary: intel.qualificationSummary,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", id);

    // 4. Try updating lead_intelligence table if available
    try {
      await supabase.from("lead_intelligence").upsert({
        lead_id: id,
        organization_id: lead.organization_id,
        urgency_score: intel.score,
        intent_summary: intel.qualificationSummary,
        recommended_action: intel.recommendedPitch,
        intent_classification: intel.intentClassification,
        priority_level: intel.priorityLevel,
        estimated_deal_size: intel.estimatedDealSizeInr,
        updated_at: new Date().toISOString(),
      } as never);
    } catch {
      // Non-fatal if table schema varies
    }

    // 5. Insert audit event
    try {
      await supabase.from("lead_events").insert({
        organization_id: lead.organization_id,
        lead_id: id,
        event_type: "AI_ANALYSIS_COMPLETED",
        title: `AI Analysis: Score ${intel.score}/100 (${intel.temperature})`,
        description: intel.qualificationSummary,
        metadata: { intelligence: intel },
      } as never);
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      success: true,
      leadId: id,
      score: intel.score,
      temperature: intel.temperature,
      summary: intel.qualificationSummary,
      recommendedPitch: intel.recommendedPitch,
      intentClassification: intel.intentClassification,
      priorityLevel: intel.priorityLevel,
      estimatedDealSizeInr: intel.estimatedDealSizeInr,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

