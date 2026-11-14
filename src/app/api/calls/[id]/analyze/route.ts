import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeCallTranscript, TranscriptTurn } from "@/lib/post-call-analyzer";
import { executeAutomationsForCall } from "@/lib/automations-runner";
import { dispatchCallEventToLeadNexus } from "@/lib/integrations/reverse-sync-dispatcher";
import type { Json } from "@/types/database";
import type { LeadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: callSessionId } = await params;
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));

    // 1. Fetch Call Session
    const { data: session, error: sessErr } = await supabase
      .from("call_sessions")
      .select("*")
      .eq("id", callSessionId)
      .single();

    if (sessErr || !session) {
      return NextResponse.json({ success: false, error: "Call session not found" }, { status: 404 });
    }

    // 2. Fetch Associated Lead & Business
    let lead: { name: string; phone: string | null; primary_interest: string | null } | null = null;
    if (session.lead_id) {
      const { data: leadData } = await supabase.from("leads").select("*").eq("id", session.lead_id).single();
      lead = leadData;
    }

    // 3. Fetch Transcripts
    const { data: dbSegments } = await supabase
      .from("transcript_segments")
      .select("*")
      .eq("call_session_id", callSessionId)
      .order("start_offset_ms", { ascending: true });

    let turns: TranscriptTurn[] = [];

    if (dbSegments && dbSegments.length > 0) {
      turns = dbSegments.map((s) => ({
        speaker: s.speaker,
        text: s.text,
        startOffsetMs: s.start_offset_ms ?? undefined,
        endOffsetMs: s.end_offset_ms ?? undefined,
      }));
    } else if (Array.isArray(body.transcripts) && body.transcripts.length > 0) {
      turns = body.transcripts;
      // Persist segments to database
      const segmentsToInsert = turns.map((t, idx) => ({
        call_session_id: callSessionId,
        speaker: t.speaker,
        text: t.text,
        confidence: 0.95,
        start_offset_ms: idx * 4000,
        end_offset_ms: (idx + 1) * 4000,
      }));
      await supabase.from("transcript_segments").insert(segmentsToInsert);
    }

    // 4. Run Evidence-Based Post-Call Analysis
    const outcome = analyzeCallTranscript({
      callSessionId,
      transcripts: turns,
      customerName: session.customer_name || lead?.name || "Customer",
      customerPhone: session.customer_phone || lead?.phone || undefined,
      businessName: "Kaveri Solar & Construction",
      customerInterest: lead?.primary_interest || "Rooftop Solar",
    });

    // 5. Persist Call Outcome to public.call_outcomes
    const { data: savedOutcome, error: outcomeErr } = await supabase
      .from("call_outcomes")
      .upsert(
        {
          call_session_id: callSessionId,
          disposition: outcome.disposition,
          sentiment: outcome.sentiment,
          confidence_score: outcome.confidenceScore,
          summary: outcome.summary,
          key_points: outcome.keyPoints as unknown as Json,
          action_items: outcome.actionItems as unknown as Json,
          qualification_decision: outcome.qualificationDecision,
          follow_up_recommended: outcome.followUpRecommended,
        },
        { onConflict: "call_session_id" }
      )
      .select()
      .single();

    if (outcomeErr) {
      return NextResponse.json({ success: false, error: outcomeErr.message }, { status: 500 });
    }

    // 6. Update call session terminal status
    await supabase
      .from("call_sessions")
      .update({
        status: "COMPLETED",
        end_time: new Date().toISOString(),
      })
      .eq("id", callSessionId);

    // 7. Apply Explicit Lead Status Update Rules & Bidirectional Reverse Sync
    if (session.lead_id) {
      const { data: currentLead } = await supabase
        .from("leads")
        .select("id, status, do_not_call")
        .eq("id", session.lead_id)
        .maybeSingle();

      if (currentLead) {
        let nextLeadStatus: LeadStatus = currentLead.status as LeadStatus;
        let setDnc = currentLead.do_not_call;

        if (outcome.disposition === "DO_NOT_CALL") {
          nextLeadStatus = "DO_NOT_CALL";
          setDnc = true;
        } else if (
          outcome.disposition === "INTERESTED" &&
          (outcome.qualificationDecision?.toUpperCase().includes("QUALIFIED") || outcome.confidenceScore >= 0.7)
        ) {
          nextLeadStatus = "QUALIFIED";
        } else if (outcome.disposition === "CALLBACK_REQUESTED") {
          nextLeadStatus = "FOLLOW_UP";
        } else if (outcome.disposition === "NOT_INTERESTED" || outcome.disposition === "WRONG_NUMBER") {
          nextLeadStatus = "LOST";
        }

        const leadUpdates: Record<string, unknown> = {
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          summary: outcome.summary || undefined,
        };

        if (nextLeadStatus !== currentLead.status) {
          leadUpdates.status = nextLeadStatus;
        }
        if (setDnc && !currentLead.do_not_call) {
          leadUpdates.do_not_call = true;
        }

        await supabase.from("leads").update(leadUpdates as never).eq("id", session.lead_id);
      }

      // Dispatch reverse sync event for call analysis completion
      try {
        await dispatchCallEventToLeadNexus({
          event: "CALL_ANALYSIS_COMPLETED",
          organizationId: session.organization_id,
          leadId: session.lead_id,
          customerName: session.customer_name || lead?.name || "Customer",
          customerPhone: session.customer_phone || lead?.phone || "",
          callSessionId,
          twilioCallSid: session.twilio_call_sid || null,
          status: "COMPLETED",
          durationSeconds: session.duration_seconds || 0,
          recordingUrl: session.recording_url || null,
          outcome: {
            disposition: outcome.disposition,
            sentiment: outcome.sentiment,
            businessOutcome: outcome.qualificationDecision,
            qualificationDecision: outcome.qualificationDecision,
            confidenceScore: outcome.confidenceScore,
            summary: outcome.summary,
            keyPoints: outcome.keyPoints.map((k) => k.point),
            actionItems: outcome.actionItems.map((a) => a.task),
            followUpRecommended: outcome.followUpRecommended,
          },
        });
      } catch (syncErr) {
        console.warn("[PostCallAnalyzer] Reverse sync dispatch failed:", syncErr);
      }
    }

    // 8. Execute Business Automations
    const automationResults = await executeAutomationsForCall(supabase, {
      organizationId: session.organization_id,
      callSessionId,
      leadId: session.lead_id || undefined,
      customerName: session.customer_name || lead?.name || "Customer",
      customerPhone: session.customer_phone || lead?.phone || undefined,
      outcome,
    });

    return NextResponse.json({
      success: true,
      outcome: savedOutcome,
      automationsTriggered: automationResults.length,
      automations: automationResults,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
