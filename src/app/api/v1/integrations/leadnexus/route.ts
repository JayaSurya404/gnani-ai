import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { leadNexusHandoffSchema } from "@/lib/integrations/contract";
import { verifyIntegrationSignature } from "@/lib/integrations/signing";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-integration-signature");
    const timestamp = req.headers.get("x-integration-timestamp");
    const requestId = req.headers.get("x-integration-request-id");

    const secret =
      process.env.VOICENEXUS_SHARED_SECRET ||
      process.env.LEADNEXUS_SHARED_SECRET ||
      "voicenexus-local-dev-secret-333";

    const path = new URL(req.url).pathname;

    // 1. Verify HMAC Signature and Clock Drift
    const verification = verifyIntegrationSignature({
      rawBody,
      signature,
      timestamp,
      requestId,
      secret,
      method: "POST",
      path,
    });

    if (!verification.isValid) {
      return NextResponse.json(
        { success: false, error: verification.reason || "Unauthorized signature" },
        { status: 401 }
      );
    }

    // 2. Validate JSON Schema
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const validation = leadNexusHandoffSchema.safeParse(parsedJson);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: validation.error.format() },
        { status: 422 }
      );
    }

    const payload = validation.data;
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Database client unavailable" },
        { status: 503 }
      );
    }

    // 3. Resolve Organization and Business
    // Check if organization exists, otherwise find default org
    const { data: orgData } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", payload.organization.id)
      .maybeSingle();

    let targetOrgId = orgData?.id;
    if (!targetOrgId) {
      const { data: firstOrg } = await supabase
        .from("organizations")
        .select("id")
        .limit(1)
        .maybeSingle();
      targetOrgId = firstOrg?.id || payload.organization.id;
    }

    // Check business
    const { data: bizData } = await supabase
      .from("businesses")
      .select("id")
      .eq("organization_id", targetOrgId)
      .limit(1)
      .maybeSingle();
    const targetBizId = bizData?.id || null;

    // 4. Clean Phone & Deduplication
    const cleanPhone = normalizePhone(payload.lead.phone);

    const { data: existingLead } = await supabase
      .from("leads")
      .select("id, status, score, name, do_not_call")
      .eq("organization_id", targetOrgId)
      .eq("phone", cleanPhone)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    let resolvedLeadId: string;
    let isDuplicate = false;

    if (existingLead) {
      isDuplicate = true;
      resolvedLeadId = existingLead.id;

      // Update lead with highest score and refreshed timestamp
      const newScore = Math.max(existingLead.score, payload.lead.score);
      const newTemp = newScore >= 75 ? "HOT" : newScore >= 50 ? "WARM" : "COLD";

      await supabase
        .from("leads")
        .update({
          score: newScore,
          temperature: newTemp,
          last_activity_at: new Date().toISOString(),
          summary: payload.lead.summary || `Handoff from LeadNexus: ${payload.lead.primaryInterest || "General Inquiry"}`,
          notes: payload.lead.notes || undefined,
          do_not_call: payload.lead.doNotCall || existingLead.do_not_call,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", resolvedLeadId);

      // Record lead event for repeat handoff
      await supabase.from("lead_events").insert({
        organization_id: targetOrgId,
        lead_id: resolvedLeadId,
        event_type: "LEADNEXUS_HANDOFF_REFRESHED",
        title: "LeadNexus Handoff Refreshed",
        description: `Lead re-synced from LeadNexus. Score: ${newScore}/100.`,
        metadata: {
          externalLeadId: payload.lead.id,
          eventId: payload.eventId,
          attribution: payload.lead.attribution,
          productSku: payload.lead.productSku,
        },
      } as never);
    } else {
      // Insert new lead record
      const { data: newLead, error: insertErr } = await supabase
        .from("leads")
        .insert({
          id: payload.lead.id, // Preserve canonical UUID if supplied
          organization_id: targetOrgId,
          business_id: targetBizId,
          name: payload.lead.name.trim(),
          phone: cleanPhone,
          email: payload.lead.email || null,
          temperature: payload.lead.temperature,
          status: payload.lead.status,
          score: payload.lead.score,
          source: payload.lead.source || "LeadNexus",
          primary_interest: payload.lead.primaryInterest || "Inbound Enquiry",
          summary: payload.lead.summary || `Imported from LeadNexus. Product: ${payload.lead.productName || payload.lead.productSku || "Standard"}`,
          notes: payload.lead.notes || null,
          do_not_call: payload.lead.doNotCall,
          last_activity_at: new Date().toISOString(),
        } as never)
        .select("id")
        .single();

      if (insertErr || !newLead) {
        // In case canonical ID conflicted, fall back to auto-generated ID
        const { data: fallbackLead, error: fallbackErr } = await supabase
          .from("leads")
          .insert({
            organization_id: targetOrgId,
            business_id: targetBizId,
            name: payload.lead.name.trim(),
            phone: cleanPhone,
            email: payload.lead.email || null,
            temperature: payload.lead.temperature,
            status: payload.lead.status,
            score: payload.lead.score,
            source: payload.lead.source || "LeadNexus",
            primary_interest: payload.lead.primaryInterest || "Inbound Enquiry",
            summary: payload.lead.summary || "Imported from LeadNexus",
            notes: payload.lead.notes || null,
            do_not_call: payload.lead.doNotCall,
            last_activity_at: new Date().toISOString(),
          } as never)
          .select("id")
          .single();

        if (fallbackErr || !fallbackLead) {
          return NextResponse.json(
            { success: false, error: fallbackErr?.message || "Failed to persist lead" },
            { status: 500 }
          );
        }
        resolvedLeadId = fallbackLead.id;
      } else {
        resolvedLeadId = newLead.id;
      }

      // Record lead event for new handoff
      await supabase.from("lead_events").insert({
        organization_id: targetOrgId,
        lead_id: resolvedLeadId,
        event_type: "LEADNEXUS_HANDOFF_RECEIVED",
        title: "LeadNexus Inbound Handoff",
        description: `Lead imported from LeadNexus. Score: ${payload.lead.score}/100 (${payload.lead.temperature}).`,
        metadata: {
          externalLeadId: payload.lead.id,
          eventId: payload.eventId,
          attribution: payload.lead.attribution,
          productSku: payload.lead.productSku,
          productName: payload.lead.productName,
        },
      } as never);
    }

    return NextResponse.json(
      {
        success: true,
        leadId: resolvedLeadId,
        duplicate: isDuplicate,
        message: isDuplicate
          ? "Lead already exists; activity and intelligence updated."
          : "Lead successfully imported and ready for AI conversation planning.",
      },
      { status: isDuplicate ? 200 : 201 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

